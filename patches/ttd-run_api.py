import asyncio

from src.application import TikTokDownloader
from src.application.main_server import APIServer
from src.custom import SERVER_HOST, SERVER_PORT


async def main():
    async with TikTokDownloader() as downloader:
        downloader.check_config()
        await downloader.check_settings(False)
        # 跳过交互式免责声明确认
        await downloader.database.update_config_data("Disclaimer", 1)
        await APIServer(
            downloader.parameter,
            downloader.database,
        ).run_server(SERVER_HOST, SERVER_PORT)


if __name__ == "__main__":
    asyncio.run(main())
