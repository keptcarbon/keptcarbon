from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import carbon, plots
from app.core.database import init_pool, close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


def create_application() -> FastAPI:
    """
    Initializes the FastAPI app with GeoAI configurations.
    """
    application = FastAPI(
        title="Rubber Plantation Carbon Estimator",
        description="Backend API for spatiotemporal mapping of biomass and carbon stocks",
        version="1.0.0",
        docs_url="/api/v1/docs",
        redoc_url="/api/v1/redoc",
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )

    # Configure CORS for the frontend web map to interact with the API
    application.add_middleware(
        CORSMiddleware,
        # In production, replace with specific frontend domains
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(
        carbon.router,
        prefix="/api/v1",
        tags=["Carbon Assessment"]
    )

    application.include_router(
        plots.router,
        prefix="/api/v1",
        tags=["Plot Management"]
    )

    return application


app = create_application()


@app.get("/")
async def root():
    """
    Health check endpoint.
    """
    return {
        "message": "GeoAI Backend Dev: Carbon Estimation System is Online",
        "status": "active"
    }
