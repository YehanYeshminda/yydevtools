import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api-config';

export interface EncodedFile {
  name: string;
  mime: string;
  size: number;
  base64: string;
}

@Injectable({ providedIn: 'root' })
export class Base64Api {
  private readonly http = inject(HttpClient);

  encodeFile(file: File): Observable<EncodedFile> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<EncodedFile>(`${API_BASE_URL}/api/tools/base64/encode`, form);
  }
}
