import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FirmaService {
  private apiUrl = 'https://app.eeasa.com.ec/WSfirmaeeasa/api/firma';

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

  verificarDocumento(pdfBase64: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verificar`, { pdfBase64 });
  }

  validarCertificado(p12Base64: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/validar-certificado`, { p12Base64, password });
  }
}