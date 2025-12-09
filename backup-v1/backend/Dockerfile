FROM node:18-slim

RUN apt-get update \
 && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libxkbcommon0 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    wget \
 && cd /tmp \
 && wget -O google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
 && apt-get install -y ./google-chrome.deb \
 && /usr/bin/google-chrome --version \
 && rm google-chrome.deb \
 && ln -sf /usr/bin/google-chrome /usr/bin/chromium \
 && ln -sf /usr/bin/google-chrome /usr/bin/chromium-browser \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome \
    CHROME_PATH=/usr/bin/google-chrome \
    CHROME_BIN=/usr/bin/google-chrome \
    GOOGLE_CHROME_BIN=/usr/bin/google-chrome \
    GOOGLE_CHROME_SHIM=/usr/bin/google-chrome

COPY package.json ./
RUN npm install

COPY . .

CMD ["node", "server-multitenant-clean.js"]
