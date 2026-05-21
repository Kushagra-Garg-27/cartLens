FROM node:20-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
    libgtk-3-0 libxshmfence1 fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Install Playwright Chromium into the package-local path
# PLAYWRIGHT_BROWSERS_PATH=0 stores browsers alongside the package,
# matching the runtime setting in docker-compose.yml
ENV PLAYWRIGHT_BROWSERS_PATH=0
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
