import asyncio
from src.wildlife.casos_de_uso import buscar_streams_youtube

async def main():
    print("Buscando streams...")
    res = await buscar_streams_youtube("birds", None)
    print("Resultados:", len(res))
    if len(res) > 0:
        print("Primer resultado:", res[0])

asyncio.run(main())
