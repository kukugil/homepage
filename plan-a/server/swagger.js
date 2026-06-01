const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-Reader Book Transfer API',
      version: '1.0.0',
      description: '蓝牙 MCU 电子阅读器无线图书传输系统 API',
    },
    servers: [
      { url: 'http://localhost:3001', description: '开发服务器' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Base64 编码的 `sn:placeholder` 令牌。仅在 TOKEN_AUTH=true 时生效。',
        },
      },
      schemas: {
        Book: {
          type: 'object',
          properties: {
            book_id: { type: 'string', example: 'b_a1b2c3d4e5f6' },
            title: { type: 'string', example: '三体' },
            author: { type: 'string', example: '' },
            file_size: { type: 'integer', example: 1024000 },
            format: { type: 'string', enum: ['epub', 'pdf', 'txt'] },
            checksum: { type: 'string', example: 'sha256:abc123...' },
            cover_url: { type: 'string', example: '/dl/SN001/covers/b_a1b2c3d4e5f6.jpg' },
            download_url: { type: 'string', example: '/dl/SN001/books/三体.epub' },
          },
        },
        UploadResult: {
          type: 'object',
          properties: {
            book_id: { type: 'string' },
            title: { type: 'string' },
            author: { type: 'string' },
            file_size: { type: 'integer' },
            format: { type: 'string' },
            checksum: { type: 'string' },
            cover_url: { type: 'string' },
            download_url: { type: 'string' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./server/routes/*.js', './server/index.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
