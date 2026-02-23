# /run-docker

Build and run the app in Docker.

```bash
docker-compose up --build
```

The app will be available at http://localhost:3000.
Data persists in the `portfolio-data` Docker volume.

To stop: `docker-compose down`
To reset: `docker-compose down -v` (removes volume)
