# One public origin for React and the Java engine; no CORS configuration.
FROM node:22-alpine AS frontend
WORKDIR /web
COPY web/package*.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-25 AS backend
WORKDIR /build
COPY pom.xml ./
RUN mvn --batch-mode -q dependency:go-offline
COPY src/ ./src/
COPY --from=frontend /web/dist/ ./src/main/resources/static/
RUN mvn --batch-mode -q -DskipTests package

FROM eclipse-temurin:25-jre-noble
WORKDIR /app
COPY --from=backend /build/target/chess-engine-1.0-SNAPSHOT.jar ./chess-engine.jar
ENV PORT=10000
EXPOSE 10000
# Keep heap below the Render Free 512 MiB limit; use spring port config.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=60.0", "-jar", "/app/chess-engine.jar"]
