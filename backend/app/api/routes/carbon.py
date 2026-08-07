from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.plots import CarbonAssessRequest, CarbonAssessResponse
from app.services.carbon_service import CarbonService

router = APIRouter()

# Initialize service once to leverage pre-loaded spatial data
service = CarbonService()

@router.post("/carbon/assess", response_model=List[CarbonAssessResponse])
async def assess_carbon(polygons: List[CarbonAssessRequest]):
    results = []

    for poly in polygons:
        try:
            # Convert Pydantic model -> dict
            poly_data = poly.model_dump()
            # Run full workflow. Use the pre-loaded service instance
            report = await service.get_carbon_profile(poly_data)
            
            results.append(report)

        except Exception as e:
            polygon_id = getattr(poly, "id", "unknown")
            raise HTTPException(
                status_code=500,
                detail=f"Error processing {polygon_id}: {str(e)}"
            )

    return results