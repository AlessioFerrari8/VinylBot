# immagine
FROM node:18-alpine 

WORKDIR /app

# Installa dipendenze di sistema
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    opus-dev \
    build-base \
    libtool \
    autoconf \
    automake

# Installa yt-dlp
RUN pip3 install yt-dlp --break-system-packages

#  
RUN npm install sodium-native

# Copia package.json e installa dipendenze npm
COPY package*.json ./
RUN npm install

# Copia il resto del codice
COPY . .

EXPOSE 8888

CMD ["node", "index.js"]