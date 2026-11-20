"""sonnenteiler, plans a small solar tracker over a crop bed: the crop's light is a duty, the rest is electricity"""

import os

# the matrices here are tiny, more blas threads only reserve memory, about 400 mb on 12 cores,
# this only works before numpy is imported and a value set from outside wins
for _name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_name, "1")

__version__ = "0.3.0"
