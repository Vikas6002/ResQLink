import os
from dataclasses import dataclass, asdict


@dataclass
class AmbulanceOptimizationWeights:
    eta: float = 0.35
    distance: float = 0.25
    capability: float = 0.15
    equipment: float = 0.15
    workload: float = 0.10


@dataclass
class HospitalOptimizationWeights:
    eta: float = 0.30
    distance: float = 0.20
    capability: float = 0.15
    resource: float = 0.20
    capacity: float = 0.15


def load_ambulance_weights():
    return AmbulanceOptimizationWeights(
        eta=float(os.getenv("OPT_ETA_WEIGHT", "0.35")),
        distance=float(os.getenv("OPT_DISTANCE_WEIGHT", "0.25")),
        capability=float(os.getenv("OPT_CAPABILITY_WEIGHT", "0.15")),
        equipment=float(os.getenv("OPT_EQUIPMENT_WEIGHT", "0.15")),
        workload=float(os.getenv("OPT_WORKLOAD_WEIGHT", "0.10")),
    )


def load_hospital_weights():
    return HospitalOptimizationWeights(
        eta=float(os.getenv("OPT_ETA_WEIGHT", "0.30")),
        distance=float(os.getenv("OPT_DISTANCE_WEIGHT", "0.20")),
        capability=float(os.getenv("OPT_HOSP_CAPABILITY_WEIGHT", "0.15")),
        resource=float(os.getenv("OPT_HOSP_RESOURCE_WEIGHT", "0.20")),
        capacity=float(os.getenv("OPT_HOSP_CAPACITY_WEIGHT", "0.15")),
    )


def weights_to_dict(weights):
    return asdict(weights)
