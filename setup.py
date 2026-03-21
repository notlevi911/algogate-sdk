from setuptools import setup


setup(
    name="algogate",
    version="0.1.0",
    description="Paywall FastAPI routes with Algorand micropayments and a scaffolded Chrome wallet extension.",
    packages=["algogate"],
    install_requires=[
        "fastapi>=0.110.0",
        "pydantic>=2.7.0",
        "httpx>=0.27.0",
        "python-dotenv>=1.0.0",
        "websockets>=12.0",
        "uvicorn>=0.29.0",
    ],
)
