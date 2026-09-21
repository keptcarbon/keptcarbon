from fastapi import APIRouter, HTTPException
from typing import List
from app.schemas.carbon import (
    CarbonAssessRequest,
    CarbonAssessResponse,
    CarbonSimulationRequest,
    CarbonSimulationResponse,
)
from app.schemas.plots import StatusMessage
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


@router.post("/carbon/sim", response_model=CarbonSimulationResponse)
async def simulation_carbon(sim_data: List[CarbonSimulationRequest]):
    try:
        # Pass the whole batch of rows through in one call -- the service
        # computes each row's central/upper/lower vectors independently, then
        # sums them by index into one final profile for the batch (e.g.
        # multiple cohorts/plantings on the same plot).
        payload = [item.model_dump() for item in sim_data]

        result = await service.get_carbon_simulation(payload)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing simulation payload: {str(e)}"
        )

    return result




