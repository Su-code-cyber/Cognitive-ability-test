from pydantic import BaseModel, ConfigDict, Field


class RequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)


class Credentials(RequestModel):
    phone: str = Field(pattern=r"^1[3-9][0-9]{9}$")
    password: str = Field(min_length=8, max_length=128)


class PageRequest(RequestModel):
    curPage: int = Field(default=1, ge=1, le=100000)
    pageSize: int = Field(default=10, ge=1, le=100)
    params: dict = Field(default_factory=dict)


class StartRequest(RequestModel):
    examId: str = Field(min_length=1, max_length=100)


class SessionRequest(RequestModel):
    sessionCode: str = Field(min_length=1, max_length=100)


class AnswerRequest(SessionRequest):
    questionId: str = Field(min_length=1, max_length=100)
    questionIndex: int = Field(ge=1, strict=True)
    answer: str = Field(max_length=200)
