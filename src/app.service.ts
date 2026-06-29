import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: 'pathnatya-backend-poc',
      status: 'ok',
      message: 'Welcome to the Pathnatya backend API',
      docs: '/docs',
    };
  }
}
