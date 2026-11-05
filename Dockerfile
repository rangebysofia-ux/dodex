FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCHEMA_DATA=/var/data SCHEMA_EXEMPEL=/app/tests/fall
WORKDIR /app

COPY pyproject.toml README.md ./
COPY schemamotor ./schemamotor
COPY schemawebb ./schemawebb
RUN pip install --no-cache-dir .

# Testfallen visas som exempel i gränssnittet
COPY tests/fall ./tests/fall
RUN mkdir -p /var/data


EXPOSE 8000
CMD ["sh", "-c", "uvicorn schemawebb.app:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
