# the brain server: the recipe chatbot and the planner in one process
# build from the server folder: docker compose -f deploy/compose.yaml up -d --build
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1

WORKDIR /app

# the dependencies of pyproject.toml, read from there so the list lives in one place
COPY pyproject.toml /app/pyproject.toml
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY brain /app/brain
COPY sonnenteiler /app/sonnenteiler
COPY eval /app/eval

# the last recipe in /data/recipe, the planner's cache, model and evaluation in /data/planner
VOLUME ["/data"]

CMD ["sh", "-c", "exec uvicorn brain.app:app --host 0.0.0.0 --port ${BRAIN_PORT:-8000}"]
