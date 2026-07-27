from fastapi import APIRouter, HTTPException
from app.schemas.plots import PlotsInfoRequest, PlotsInfoResponse
from app.services.plots_service import PlotsService

router = APIRouter()

service = PlotsService()


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
