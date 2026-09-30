FROM node:20-alpine

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Construir el frontend de producción
RUN npm run build

# Exponer el puerto
EXPOSE 3000

ENV NODE_ENV=production

# Ejecutar el servidor con tsx
CMD ["npx", "tsx", "server.ts"]
