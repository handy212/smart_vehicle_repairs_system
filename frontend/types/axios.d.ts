import 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean;
    skipAuthRefresh?: boolean;
    _retry?: boolean;
  }

  interface InternalAxiosRequestConfig {
    skipAuth?: boolean;
    skipAuthRefresh?: boolean;
    _retry?: boolean;
  }
}
