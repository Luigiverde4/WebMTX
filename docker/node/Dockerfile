FROM node:20-alpine

WORKDIR /home/app

# Copiar package.json primero para aprovechar cache de Docker
COPY server/package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY server/ .

# Puertos de la aplicación (80 solo redirige a HTTPS; ver HTTP_REDIRECT)
EXPOSE 80 443

# Comando de inicio
CMD ["npm", "start"]