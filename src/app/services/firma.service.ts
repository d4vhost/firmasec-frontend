import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class FirmaService {
  private apiUrl = 'http://localhost:8080/firmaec-api/api/firma'; // Cambiado a nuevo controlador

  constructor(private http: HttpClient) {}

  firmarDocumentoCentralizado(pdfBase64: string, p12Base64: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/firmar`, { 
      pdfBase64, 
      p12Base64, 
      password 
    });
  }
}