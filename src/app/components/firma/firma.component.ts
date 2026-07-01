import { Component, ElementRef, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirmaService } from '../../services/firma.service';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';

// Worker local (copiado a /pdf.worker.min.mjs por angular.json assets)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const DB_NAME = 'FirmaEC_DB';
const STORE_NAME = 'certStore';

function saveCertToIndexedDB(certFile: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(certFile, 'miCertificado');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function loadCertFromIndexedDB(): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e: any) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
         resolve(null);
         return;
      }
      const tx = db.transaction(STORE_NAME, 'readonly');
      const getReq = tx.objectStore(STORE_NAME).get('miCertificado');
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = () => reject(getReq.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteCertFromIndexedDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
         resolve();
         return;
      }
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('miCertificado');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

@Component({
  selector: 'app-firma',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './firma.component.html',
  styleUrls: ['./firma.component.css']
})
export class FirmaComponent implements OnInit, OnDestroy {

  // ── Desktop UI State ──
  currentDate = new Date().toLocaleString('es-EC');

  // ── FirmaEC Modal State ──
  showFirmaECModal: boolean = false;
  firmaECTab: 'firmar' | 'verificar' | 'validar' = 'firmar';
  
  savedCertFile: File | null = null;
  tempUploadCert: File | null = null;

  // ── Formulario ──
  adjuntos: { name: string; base64: string }[] = [];
  adjuntoSeleccionado: number = -1;
  
  get pdfBase64(): string {
    return this.adjuntoSeleccionado >= 0 ? this.adjuntos[this.adjuntoSeleccionado].base64 : '';
  }

  get pdfFileName(): string {
    return this.adjuntoSeleccionado >= 0 ? this.adjuntos[this.adjuntoSeleccionado].name : '';
  }

  p12Base64: string = '';
  p12FileName: string = '';
  password: string = '';
  isDragOver: boolean = false;
  isLoading: boolean = false;

  // ── Visor ──
  showViewer: boolean = false;
  pdfRendering: boolean = false;
  page: number = 1;
  totalPages: number = 1;

  // ── Sello flotante ──
  selloX: number = 0;
  selloY: number = 0;
  selloVisible: boolean = false;
  selloFijado: boolean = false;
  selloFijoX: number = 0;
  selloFijoY: number = 0;

  // ── Coordenadas PDF ──
  coordPdfX: number = 50;
  coordPdfY: number = 50;
  coordPagina: number = 1;

  // ── PDF.js interno ──
  private pdfDoc: any = null;
  private renderScale: number = 1;
  private pageViewport: any = null;

  hoy: string = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' });

  @ViewChild('pdfCanvas') pdfCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') canvasWrapper!: ElementRef<HTMLDivElement>;

  constructor(private firmaService: FirmaService) {}

  async ngOnInit() {
    try {
      const cert = await loadCertFromIndexedDB();
      if (cert) {
        this.savedCertFile = cert;
        await this.readSavedCertAsBase64();
      }
    } catch (e) {
      console.error("No se pudo cargar el certificado guardado", e);
    }
  }

  ngOnDestroy() { this.pdfDoc = null; }

  // ── Lógica de FirmaEC Modal ──
  abrirModalFirmaEC() {
    this.showFirmaECModal = true;
    this.firmaECTab = 'firmar';
  }

  cerrarModalFirmaEC() {
    this.showFirmaECModal = false;
    this.password = ''; // Limpiar contraseña por seguridad al cerrar
  }

  cambiarTabFirmaEC(tab: 'firmar' | 'verificar' | 'validar') {
    this.firmaECTab = tab;
  }

  onTempCertSelected(e: any) {
    const file = e.target.files[0];
    if (file) {
      this.tempUploadCert = file;
    }
  }

  async guardarCertificado() {
    if (this.tempUploadCert) {
      await saveCertToIndexedDB(this.tempUploadCert);
      this.savedCertFile = this.tempUploadCert;
      await this.readSavedCertAsBase64();
      alert('Certificado guardado exitosamente en el navegador.');
      this.tempUploadCert = null;
    }
  }

  async borrarCertificado() {
    await deleteCertFromIndexedDB();
    this.savedCertFile = null;
    this.p12Base64 = '';
    this.p12FileName = '';
    alert('Certificado borrado del navegador.');
  }

  private readSavedCertAsBase64(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.savedCertFile) { resolve(); return; }
      this.p12FileName = this.savedCertFile.name;
      const reader = new FileReader();
      reader.onload = () => {
        this.p12Base64 = (reader.result as string).split(',')[1];
        resolve();
      };
      reader.readAsDataURL(this.savedCertFile);
    });
  }

  // ─── Archivos ────────────────────────────────────────────────────────────────

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragOver = true; }
  onDragLeave(e: DragEvent) { e.preventDefault(); this.isDragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file?.type === 'application/pdf') this.processFile(file, 'pdf');
    else alert('Por favor arrastra un archivo PDF válido.');
  }

  onFileSelected(e: any, type: 'pdf' | 'p12') {
    const file = e.target.files[0];
    if (file) this.processFile(file, type);
  }

  private processFile(file: File, type: 'pdf' | 'p12') {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (type === 'pdf') {
        this.adjuntos.push({ name: file.name, base64 });
        this.adjuntoSeleccionado = this.adjuntos.length - 1;
        this.pdfDoc = null;
        this.showViewer = false;
        this.selloFijado = false;
        this.selloVisible = false;
        this.page = 1;
      } else {
        this.p12Base64 = base64;
        this.p12FileName = file.name;
      }
    };
  }

  seleccionarAdjunto(index: number) {
    this.adjuntoSeleccionado = index;
    this.pdfDoc = null;
    this.showViewer = false;
    this.selloFijado = false;
    this.selloVisible = false;
    this.page = 1;
  }

  eliminarAdjunto() {
    if (this.adjuntoSeleccionado >= 0) {
      this.adjuntos.splice(this.adjuntoSeleccionado, 1);
      this.adjuntoSeleccionado = this.adjuntos.length > 0 ? 0 : -1;
      this.pdfDoc = null;
      this.showViewer = false;
      this.selloFijado = false;
      this.selloVisible = false;
      this.page = 1;
    }
  }

  // ─── Validación ───────────────────────────────────────────────────────────────

  get formularioValido(): boolean {
    return !!(this.pdfBase64 && this.p12Base64 && this.password);
  }

  get pdfFileNameBase(): string {
    return this.pdfFileName.replace(/\.pdf$/i, '');
  }

  // ─── Visor ────────────────────────────────────────────────────────────────────

  isDragOverVerificar: boolean = false;
  documentosVerificar: { name: string, path: string }[] = [];

  onDragOverVerificar(e: DragEvent) { e.preventDefault(); this.isDragOverVerificar = true; }
  onDragLeaveVerificar(e: DragEvent) { e.preventDefault(); this.isDragOverVerificar = false; }
  
  onDropVerificar(e: DragEvent) {
    e.preventDefault();
    this.isDragOverVerificar = false;
    const files = e.dataTransfer?.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type === 'application/pdf') {
          this.documentosVerificar.push({ name: files[i].name, path: 'C:\\Users\\mcruz\\Downloads\\' + files[i].name });
        }
      }
    }
  }
  
  onFileSelectedVerificar(e: any) {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        this.documentosVerificar.push({ name: files[i].name, path: 'C:\\Users\\mcruz\\Downloads\\' + files[i].name });
      }
    }
    // Limpiar input para permitir seleccionar el mismo de nuevo si se borró
    e.target.value = null;
  }

  quitarDocumentoVerificar(index: number) {
    this.documentosVerificar.splice(index, 1);
  }

  restablecerVerificar() {
    this.documentosVerificar = [];
  }

  verificarArchivos() {
    if (this.documentosVerificar.length === 0) return;
    alert(`Simulación: ${this.documentosVerificar.length} documento(s) enviado(s) a verificar al backend. Las firmas son válidas.`);
  }

  async abrirVisor() {
    if (!this.formularioValido) {
      alert('Por favor completa todos los campos: PDF, Certificado y Contraseña.');
      return;
    }
    this.selloFijado = false;
    this.selloVisible = false;
    this.showViewer = true;
    this.pdfRendering = true;

    setTimeout(() => this.cargarPdf(), 50); // Dar tiempo al DOM
  }

  private async cargarPdf() {
    try {
      const data = atob(this.pdfBase64);
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);

      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      this.pdfDoc = await loadingTask.promise;
      this.totalPages = this.pdfDoc.numPages;

      await this.renderPagina(this.page);
    } catch (err) {
      console.error('Error cargando PDF:', err);
      this.pdfRendering = false;
    }
  }

  async renderPagina(num: number) {
    if (!this.pdfDoc) return;
    this.pdfRendering = true;
    this.selloVisible = false;
    this.selloFijado = false;

    const page = await this.pdfDoc.getPage(num);
    const wrapper = this.canvasWrapper.nativeElement;

    // Escalar para que el PDF ocupe el ancho disponible
    const desiredWidth = wrapper.clientWidth || 800;
    const baseViewport = page.getViewport({ scale: 1 });
    this.renderScale = desiredWidth / baseViewport.width;
    this.pageViewport = page.getViewport({ scale: this.renderScale });

    const canvas = this.pdfCanvas.nativeElement;
    canvas.width  = this.pageViewport.width;
    canvas.height = this.pageViewport.height;

    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport: this.pageViewport
    }).promise;

    this.pdfRendering = false;
    this.selloVisible = true;
  }

  cerrarVisor() {
    this.showViewer = false;
    this.selloFijado = false;
    this.selloVisible = false;
  }

  // ─── Cambio de página ────────────────────────────────────────────────────────

  async cambiarPagina(delta: number) {
    const nueva = this.page + delta;
    if (nueva < 1 || nueva > this.totalPages) return;
    this.page = nueva;
    await this.renderPagina(this.page);
  }

  // ─── Mouse sobre el canvas ────────────────────────────────────────────────────

  onMouseMove(e: MouseEvent) {
    if (!this.selloVisible || this.selloFijado) return;
    const rect = this.pdfCanvas.nativeElement.getBoundingClientRect();
    this.selloX = e.clientX - rect.left;
    this.selloY = e.clientY - rect.top;
  }

  onCanvasClick(e: MouseEvent) {
    if (!this.selloVisible || this.pdfRendering) return;

    const canvas = this.pdfCanvas.nativeElement;
    const rect   = canvas.getBoundingClientRect();

    // Posición visual del sello: el clic marca la esquina superior-izquierda del QR
    this.selloFijoX = (e.clientX - rect.left);
    this.selloFijoY = (e.clientY - rect.top);
    this.selloFijado = true;

    // Para el PDF: usar el punto exacto del clic
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // El canvas CSS puede estar escalado vs el canvas interno
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasClickX = clickX * scaleX;
    const canvasClickY = clickY * scaleY;

    // Convertir de píxeles del canvas a puntos PDF
    const pdfClickX = canvasClickX / this.renderScale;
    const pdfClickY = canvasClickY / this.renderScale;

    // PDF tiene Y invertido (0 = abajo).
    // El backend dibuja el QR desde su esquina INFERIOR-IZQUIERDA.
    // El clic del usuario marca la esquina SUPERIOR-IZQUIERDA.
    // El QR mide 36pt de alto, así que: posY_backend = pageHeight - clickY - 36
    const pageHeight = this.pageViewport.viewBox[3];
    const pdfY_fromBottom = pageHeight - pdfClickY;

    // X = exacto donde hizo clic (esquina izquierda del QR)
    // Y = restar el alto del QR para que la esquina superior quede en el punto de clic
    this.coordPdfX = Math.max(10, Math.round(pdfClickX));
    this.coordPdfY = Math.max(10, Math.round(pdfY_fromBottom - 36));
    this.coordPagina = this.page;

    console.log('Click CSS:', clickX, clickY, '-> PDF:', this.coordPdfX, this.coordPdfY, 'page:', this.coordPagina);
  }

  // ─── Firma ───────────────────────────────────────────────────────────────────

  confirmarFirma() {
    this.showViewer = false;
    this.isLoading = true;

    this.firmaService.firmarDocumentoCentralizado(
      this.pdfBase64, this.p12Base64, this.password,
      this.coordPagina, this.coordPdfX, this.coordPdfY
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.descargarPdf(res.pdfFirmado, `${this.pdfFileNameBase}-signed.pdf`);
        this.password = '';
        this.selloFijado = false;
        alert('Documento firmado y guardado como ' + this.pdfFileNameBase + '-signed.pdf');
      },
      error: (err) => {
        this.isLoading = false;
        this.password = '';
        console.error('Error al firmar:', err);
        alert('Error al firmar. Verifica tu contraseña y certificado.');
      }
    });
  }

  private descargarPdf(base64: string, fileName: string) {
    const link = document.createElement('a');
    link.href = 'data:application/pdf;base64,' + base64;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}