import asyncio
import os
from langchain_deepseek import ChatDeepSeek
from langchain_core.messages import HumanMessage
from pydantic import BaseModel, Field

class GetWeather(BaseModel):
    """Get the current weather in a given location"""
    location: str = Field(..., description="The city and state, e.g. San Francisco, CA")

async def main():
    llm = ChatDeepSeek(model="deepseek-reasoner", temperature=0, streaming=True)
    llm_with_tools = llm.bind_tools([GetWeather])
    
    print("\nTesting stream with tools:")
    async for chunk in llm_with_tools.astream([HumanMessage(content="What is the weather in Tokyo? think out loud")]):
        print(f"content: {repr(chunk.content)}, kwargs: {chunk.additional_kwargs}")

asyncio.run(main())
