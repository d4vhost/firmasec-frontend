import { Component } from '@angular/core';
import { FirmaComponent } from './components/firma/firma.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FirmaComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'firmaec-frontend';
}