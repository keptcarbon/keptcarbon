from fastapi import APIRouter, HTTPException
from app.schemas.plots import (
    PlotsInfoRequest, PlotsInfoResponse, PlotsNavRequest, PlotsNavResponse,
    PlotsLocateRequest, PlotsLocateResponse,
)
from app.services.plots_service import PlotsService
from app.services.location_service import LocationService

router = APIRouter()

service = PlotsService()
location_service = LocationService()


@router.post("/plots/info", response_model=PlotsInfoResponse)
async def get_info(polygon: PlotsInfoRequest):
    try:
        poly_data = polygon.model_dump()
        result = await service.get_plots_info(poly_data)
        return result
    except Exception as e:
        print(f"Error processing plots info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process plots info: {str(e)}"
        )


@router.post("/plots/nav", response_model=PlotsNavResponse)
async def get_nav_info(latlon: PlotsNavRequest):
    try:
        latlon_data = latlon.model_dump()
        result = await service.get_plots_nav_info(latlon_data)
        return result
    except Exception as e:
        print(f"Error processing plots nav info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process plots nav info: {str(e)}"
        )


@router.post("/plots/locate", response_model=PlotsLocateResponse)
async def locate(payload: PlotsLocateRequest):
    try:
        items = [item.model_dump() for item in payload.items]
        results = await location_service.locate(items)
        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error locating plots: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to locate plots: {str(e)}"
        )
