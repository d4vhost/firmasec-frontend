// Polyfill para Promise.try usado internamente por PDF.js en ciertos documentos
if (!(Promise as any).try) {
  (Promise as any).try = function(callback: any) {
    return new Promise((resolve, reject) => {
      try {
        resolve(callback());
      } catch (e) {
        reject(e);
      }
    });
  };
}

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
