import { Component, ElementRef, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirmaService } from '../../services/firma.service';
import * as pdfjsLib from 'pdfjs-dist';

// Worker local (copiado a /pdf.worker.min.mjs por angular.json assets)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

@Component({
  selector: 'app-firma',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './firma.component.html',
  styleUrls: ['./firma.component.css']
})
export class FirmaComponent implements OnDestroy {

  // ── Formulario ──
  pdfBase64: string = '';
  pdfFileName: string = '';
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

  ngOnDestroy() { this.pdfDoc = null; }

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
        this.pdfBase64 = base64;
        this.pdfFileName = file.name;
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

  // ─── Validación ───────────────────────────────────────────────────────────────

  get formularioValido(): boolean {
    return !!(this.pdfBase64 && this.p12Base64 && this.password);
  }

  get pdfFileNameBase(): string {
    return this.pdfFileName.replace(/\.pdf$/i, '');
  }

  // ─── Visor ────────────────────────────────────────────────────────────────────

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
    // El QR mide 55pt de alto, así que: posY_backend = pageHeight - clickY - 55
    const pageHeight = this.pageViewport.viewBox[3];
    const pdfY_fromBottom = pageHeight - pdfClickY;

    // X = exacto donde hizo clic (esquina izquierda del QR)
    // Y = restar el alto del QR para que la esquina superior quede en el punto de clic
    this.coordPdfX = Math.max(10, Math.round(pdfClickX));
    this.coordPdfY = Math.max(10, Math.round(pdfY_fromBottom - 55));
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