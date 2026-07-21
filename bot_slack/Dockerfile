FROM node:20-alpine

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

# Copia package.json e installa dipendenze
COPY package*.json ./
RUN npm install --production

# Copia il resto del codice
COPY . .

EXPOSE 8889

# --max-old-space-size=400: Limita la RAM di Node a 400MB (per stare nei 512MB di Railway)
# --expose-gc: Permette al codice di chiamare global.gc() per pulire la RAM dopo la generazione del token
CMD ["node", "--max-old-space-size=400", "--expose-gc", "index.js"]