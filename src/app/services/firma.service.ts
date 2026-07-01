import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FirmaService {
  private apiUrl = 'http://localhost:8080/firmaec-api/api/firma'; // Cambiado a nuevo controlador

  constructor(private http: HttpClient) {}

  firmarDocumentoCentralizado(pdfBase64: string, p12Base64: string, password: string, pagina: number = 1, posX: number = 50, posY: number = 50): Observable<any> {
    const payload = {
      pdfBase64: pdfBase64,
      p12Base64: p12Base64,
      password: password,
      pagina: pagina,
      posX: posX,
      posY: posY
    };
    return this.http.post(`${this.apiUrl}/firmar`, payload);
  }
}