from types import SimpleNamespace

import pytest

from deerflow.rigor import RigorAnalysisError, RigorDocumentAnalyzer


class FakeModel:
    def __init__(self, content: str):
        self.content = content
        self.messages = []

    async def ainvoke(self, messages):
        self.messages.append(messages)
        return SimpleNamespace(content=self.content)


@pytest.mark.asyncio
async def test_rigor_analyzer_returns_structured_source_backed_requirements():
    model = FakeModel(
        """
        {
          "requirements": [
            {
              "department": "video",
              "category": "video transport",
              "requirement_text": "Provide four tactical fiber paths from FOH to stage.",
              "normalized_value": "4 FIBER PATHS",
              "unit": null,
              "source_page": 2,
              "source_excerpt": "Provide (4) tactical fiber paths, FOH to stage video world.",
              "confidence": 0.96
            }
          ]
        }
        """
    )
    analyzer = RigorDocumentAnalyzer(model_factory=lambda: model)

    result = await analyzer.analyze(
        document_name="Tour Rider.pdf",
        pages=[
            "General production notes.",
            "Provide (4) tactical fiber paths, FOH to stage video world.",
        ],
    )

    assert len(result.requirements) == 1
    item = result.requirements[0]
    assert item.department == "Video"
    assert item.category == "VIDEO_TRANSPORT"
    assert item.source_page == 2
    assert item.normalized_value == "4 FIBER PATHS"
    assert item.confidence == 0.96

    system_text = str(model.messages[0][0].content)
    assert "untrusted source material" in system_text
    human_text = str(model.messages[0][1].content)
    assert "[[PAGE 2]]" in human_text


@pytest.mark.asyncio
async def test_rigor_analyzer_rejects_invalid_model_json():
    analyzer = RigorDocumentAnalyzer(
        model_factory=lambda: FakeModel("not valid json")
    )

    with pytest.raises(RigorAnalysisError, match="invalid structured JSON"):
        await analyzer.analyze(
            document_name="Venue Pack.pdf",
            pages=["Venue must provide 200A show power."],
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("source_page", "source_excerpt", "error_message"),
    [
        (None, "Venue must provide 200A show power.", "valid source page"),
        (99, "Venue must provide 200A show power.", "valid source page"),
        (1, "Venue must provide 400A show power.", "source excerpt absent"),
    ],
)
async def test_rigor_analyzer_rejects_unverifiable_source_citations(
    source_page, source_excerpt, error_message
):
    import json

    payload = {
        "requirements": [
            {
                "department": "Power",
                "category": "POWER_CAPACITY",
                "requirement_text": "Venue show power capacity.",
                "normalized_value": "200A",
                "unit": "A",
                "source_page": source_page,
                "source_excerpt": source_excerpt,
                "confidence": 0.99,
            }
        ]
    }
    analyzer = RigorDocumentAnalyzer(
        model_factory=lambda: FakeModel(json.dumps(payload))
    )

    with pytest.raises(RigorAnalysisError, match=error_message):
        await analyzer.analyze(
            document_name="Venue Pack.pdf",
            pages=["Venue must provide 200A show power."],
        )


@pytest.mark.asyncio
async def test_rigor_analyzer_rejects_excerpt_from_different_page():
    import json

    payload = {
        "requirements": [
            {
                "department": "Power",
                "category": "POWER_CAPACITY",
                "requirement_text": "Venue power capacity.",
                "source_page": 1,
                "source_excerpt": "Venue must provide 200A show power.",
                "confidence": 0.99,
            }
        ]
    }
    analyzer = RigorDocumentAnalyzer(
        model_factory=lambda: FakeModel(json.dumps(payload))
    )

    with pytest.raises(RigorAnalysisError, match="source excerpt absent"):
        await analyzer.analyze(
            document_name="Venue Pack.pdf",
            pages=["Stage depth is 20 feet.", "Venue must provide 200A show power."],
        )
