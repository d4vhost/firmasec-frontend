import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirmaService } from '../../services/firma.service';

@Component({
  selector: 'app-firma',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './firma.component.html',
  styleUrls: ['./firma.component.css']
})
export class FirmaComponent {
  pdfBase64: string = '';
  pdfFileName: string = '';
  
  p12Base64: string = '';
  p12FileName: string = '';
  
  password: string = '';
  isLoading: boolean = false;
  isDragOver: boolean = false;

  constructor(private firmaService: FirmaService) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf') {
        this.processFile(file, 'pdf');
      } else {
        alert('Por favor, arrastra un archivo PDF válido.');
      }
    }
  }

  onFileSelected(event: any, type: 'pdf' | 'p12') {
    const file = event.target.files[0];
    if (file) {
      this.processFile(file, type);
    }
  }

  private processFile(file: File, type: 'pdf' | 'p12') {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (type === 'pdf') {
        this.pdfBase64 = base64;
        this.pdfFileName = file.name;
      } else {
        this.p12Base64 = base64;
        this.p12FileName = file.name;
      }
    };
  }

  firmar() {
    if (!this.pdfBase64 || !this.p12Base64 || !this.password) {
      alert('Por favor, completa todos los campos.');
      return;
    }

    this.isLoading = true;

    this.firmaService.firmarDocumentoCentralizado(this.pdfBase64, this.p12Base64, this.password).subscribe({
      next: (res) => {
        this.isLoading = false;
        // res.pdfFirmado contiene el PDF en base64
        this.descargarPdf(res.pdfFirmado, 'documento_firmado.pdf');
        
        // Limpiar contraseña por seguridad
        this.password = '';
        alert('Documento firmado con éxito.');
      },
      error: (err) => {
        this.isLoading = false;
        this.password = '';
        console.error('Error al firmar:', err);
        alert('Hubo un error al firmar el documento. Verifica tu contraseña.');
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