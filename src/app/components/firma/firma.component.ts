import { Component, ElementRef, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirmaService } from '../../services/firma.service';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';

// Forzar la misma versión del worker desde CDN para evitar el error de "API version does not match Worker version"
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs`;

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

  // ── Validar Certificado ──
  tempCertPassword: string = '';
  certValidationResult: string = '';
  showErrorModalValidar: boolean = false;
  errorModalTitle: string = 'Error';
  errorModalMsg1: string = 'No se encuentran certificados para firmar';
  errorModalMsg2: string = 'Puede estar expirado, revocado o no reconocido';

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
      console.warn("No se pudo cargar el certificado guardado");
    }
  }

  ngOnDestroy() { this.pdfDoc = null; }

  // ── Lógica de FirmaEC Modal ──
  abrirModalFirmaEC() {
    this.showFirmaECModal = true;
    this.firmaECTab = 'firmar';
    this.adjuntoSeleccionado = -1;
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
    this.tempUploadCert = null;
    this.certValidationResult = '';
    this.tempCertPassword = '';
    alert('Certificado borrado del navegador.');
  }

  onTempCertSelectedValidar(e: any) {
    const file = e.target.files[0];
    if (file) {
      this.tempUploadCert = file;
    }
  }

  isDragOverValidar: boolean = false;
  onDragOverValidar(e: DragEvent) { e.preventDefault(); this.isDragOverValidar = true; }
  onDragLeaveValidar(e: DragEvent) { e.preventDefault(); this.isDragOverValidar = false; }
  onDropValidar(e: DragEvent) {
    e.preventDefault();
    this.isDragOverValidar = false;
    const file = e.dataTransfer?.files[0];
    if (file && (file.name.endsWith('.p12') || file.name.endsWith('.pfx'))) {
      this.tempUploadCert = file;
    } else {
      alert('Por favor arrastre un archivo .p12 o .pfx válido.');
    }
  }

  restablecerValidar() {
    this.tempUploadCert = null;
    this.tempCertPassword = '';
    this.certValidationResult = '';
  }

  validarCertificadoBackend() {
    if (!this.tempUploadCert || !this.tempCertPassword) return;
    
    this.certValidationResult = 'Validando certificado...';
    
    const reader = new FileReader();
    reader.readAsDataURL(this.tempUploadCert);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      this.firmaService.validarCertificado(base64, this.tempCertPassword).subscribe({
        next: async (res) => {
          if (res.valido) {
            this.certValidationResult = `=== RESULTADO DE LA VERIFICACIÓN ===\n\nEstado: VÁLIDO\n\nPropietario: ${res.subjectDN}\nEmitido por: ${res.issuerDN}\nVálido desde: ${new Date(res.validFrom).toLocaleString()}\nVálido hasta: ${new Date(res.validTo).toLocaleString()}\n\nEl certificado ha sido verificado exitosamente y puede ser utilizado para firmar documentos.`;
            // Guardar automáticamente tras validación exitosa
            await saveCertToIndexedDB(this.tempUploadCert!);
            this.savedCertFile = this.tempUploadCert;
            await this.readSavedCertAsBase64();
          } else {
            this.certValidationResult = ``;
            this.errorModalTitle = 'Error';
            this.errorModalMsg1 = 'No se encuentran certificados para firmar';
            this.errorModalMsg2 = 'Puede estar expirado, revocado o no reconocido';
            this.showErrorModalValidar = true;
          }
        },
        error: (err) => {
          this.certValidationResult = ``;
          this.errorModalTitle = 'Error';
          this.errorModalMsg1 = 'Error de conexión con el servidor de validación';
          this.errorModalMsg2 = err.message || 'Verifique que el backend esté en ejecución.';
          this.showErrorModalValidar = true;
        }
      });
    };
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

  seleccionarAdjuntoDesdeFirma(indexStr: string) {
    const index = parseInt(indexStr, 10);
    if (!isNaN(index) && index >= 0 && index < this.adjuntos.length) {
      this.seleccionarAdjunto(index);
    }
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
  documentosVerificar: { name: string, path: string, file: File, verificado?: boolean, valido?: boolean, firmantes?: any[] }[] = [];
  
  showFirmantesModal: boolean = false;
  docSeleccionado: any = null;
  fechaActual = new Date();

  onDragOverVerificar(e: DragEvent) { e.preventDefault(); this.isDragOverVerificar = true; }
  onDragLeaveVerificar(e: DragEvent) { e.preventDefault(); this.isDragOverVerificar = false; }
  
  onDropVerificar(e: DragEvent) {
    e.preventDefault();
    this.isDragOverVerificar = false;
    const files = e.dataTransfer?.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].type === 'application/pdf') {
          this.documentosVerificar.push({ name: files[i].name, path: files[i].name, file: files[i] });
        }
      }
    }
  }
  
  onFileSelectedVerificar(e: any) {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        this.documentosVerificar.push({ name: files[i].name, path: files[i].name, file: files[i] });
      }
    }
    e.target.value = null;
  }

  agregarDesdeAdjuntos(indexStr: string) {
    if (!indexStr) return;
    const index = parseInt(indexStr, 10);
    const adj = this.adjuntos[index];
    if (adj) {
      const exists = this.documentosVerificar.some(d => d.name === adj.name);
      if (!exists) {
        // Convertir base64 a File para unificación
        const byteCharacters = atob(adj.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
            byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: 'application/pdf'});
        const file = new File([blob], adj.name, {type: 'application/pdf'});

        this.documentosVerificar.push({ name: adj.name, path: adj.name, file: file });
      } else {
        alert('Este documento ya se encuentra en la lista para verificar.');
      }
    }
  }

  quitarDocumentoVerificar(index: number) {
    this.documentosVerificar.splice(index, 1);
  }

  restablecerVerificar() {
    this.documentosVerificar = [];
  }

  verificarArchivos() {
    if (this.documentosVerificar.length === 0) return;
    
    this.documentosVerificar.forEach(doc => {
      // Leer el archivo como Base64 y enviarlo al backend
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        
        this.firmaService.verificarDocumento(base64).subscribe({
          next: (resp: any) => {
            doc.verificado = true;
            
            if (resp.firmantes && resp.firmantes.length > 0) {
              doc.firmantes = resp.firmantes.map((f: any) => {
                let idText = f.cedula || '---';
                return {
                  cedulaNombre: idText + '<br>' + (f.nombre || '---'),
                  razonLocalizacion: (f.razon || 'Firma Electrónica') + '<br>' + (f.localizacion || 'Ecuador'),
                fechaFirmado: (f.fechaFirmado || '---').replace(' hora de Ecuador', '<br>hora de Ecuador'),
                entidadCertificadora: f.entidadCertificadora || 'Desconocida',
                fechaEmision: (f.fechaEmision || '---').replace(' hora de Ecuador', '<br>hora de Ecuador'),
                fechaExpiracion: (f.fechaExpiracion || '---').replace(' hora de Ecuador', '<br>hora de Ecuador'),
                fechaRevocacion: f.fechaRevocacion || '---',
                selladoTiempo: f.selladoTiempo || 'No',
                valido: f.valido === true
                };
              });
              
              // El documento es válido si TODOS sus firmantes son válidos
              doc.valido = doc.firmantes?.every((f: any) => f.valido) ?? false;
            } else {
              // Sin firmas
              doc.valido = false;
              doc.firmantes = [];
            }
          },
          error: (err: any) => {
            // Error de verificación registrado internamente
            doc.verificado = true;
            doc.valido = false;
            doc.firmantes = [{
              cedulaNombre: '---<br>Error de verificación',
              razonLocalizacion: '---',
              fechaFirmado: '---',
              entidadCertificadora: 'No se pudo conectar al servidor',
              fechaEmision: '---',
              fechaExpiracion: '---',
              fechaRevocacion: '---',
              selladoTiempo: '---',
              valido: false
            }];
          }
        });
      };
      reader.readAsDataURL(doc.file);
    });
  }

  abrirDocumento(doc: any) {
    const url = URL.createObjectURL(doc.file);
    window.open(url, '_blank');
  }

  verDetalles(doc: any) {
    if (!doc.valido) {
      this.errorModalTitle = 'Error de Verificación';
      this.errorModalMsg1 = 'Entidad Certificadora no reconocida';
      this.errorModalMsg2 = 'El documento no ha sido firmado por una entidad de confianza.';
      this.showErrorModalValidar = true;
      return;
    }
    this.docSeleccionado = doc;
    this.showFirmantesModal = true;
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

    // Esperar a que Angular renderice el modal y el canvas esté disponible
    this.esperarCanvas();
  }

  private esperarCanvas(intentos: number = 0) {
    setTimeout(() => {
      const wrapper = this.canvasWrapper?.nativeElement;
      if (wrapper && wrapper.clientWidth > 0) {
        this.cargarPdf();
      } else if (intentos < 10) {
        // Reintentar hasta que el DOM esté listo (máx 10 intentos = 2 segundos)
        this.esperarCanvas(intentos + 1);
      } else {
        this.pdfRendering = false;
        alert('Error: No se pudo cargar el visor del PDF. Intente de nuevo.');
      }
    }, 200);
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
      console.error('Error al cargar PDF:', err);
      this.pdfRendering = false;
      alert('Error interno al renderizar el PDF. Revisa la consola (F12).');
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

    // Coordenadas de firma calculadas
  }

  // ─── Firma ───────────────────────────────────────────────────────────────────

  prepararFirma() {
    this.isLoading = true;
    this.firmaService.validarCertificado(this.p12Base64, this.password).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res.valido) {
          this.abrirVisor();
        } else {
          this.errorModalTitle = 'Contraseña Incorrecta';
          this.errorModalMsg1 = 'La contraseña del certificado no es válida.';
          this.errorModalMsg2 = 'Por favor, revise su contraseña e intente nuevamente.';
          this.showErrorModalValidar = true;
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorModalTitle = 'Error de Validación';
        this.errorModalMsg1 = 'No se pudo validar el certificado.';
        this.errorModalMsg2 = err.error?.message || 'Verifique la contraseña y la vigencia del certificado.';
        this.showErrorModalValidar = true;
      }
    });
  }

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
        // Error al firmar registrado internamente
        
        this.errorModalTitle = 'Error al Firmar';
        this.errorModalMsg1 = 'No se pudo firmar el documento.';
        this.errorModalMsg2 = 'Por favor, asegúrese de que la contraseña sea correcta.';
        this.showErrorModalValidar = true;
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