FROM node:22-slim AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:8000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

FROM node:22-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
