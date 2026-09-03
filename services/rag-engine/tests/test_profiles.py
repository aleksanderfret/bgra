from rag_engine.settings import PROFILES, profile_context_budget_ok


def test_every_profile_fits_its_retrieval_budget() -> None:
    for name, profile in PROFILES.items():
        assert profile_context_budget_ok(profile), (
            f"Profile {name!r} asks for {profile.retrieval_top_k} passages "
            f"in a {profile.context_tokens}-token window"
        )


def test_minimal_profile_keeps_shared_retrieval_models() -> None:
    minimal = PROFILES["minimal-16gb"]
    starter = PROFILES["starter-32gb"]

    assert minimal.embedding == starter.embedding
    assert minimal.reranker == starter.reranker
    assert minimal.llm_arbiter is None
    assert minimal.vision is None
    assert minimal.retrieval_top_k <= starter.retrieval_top_k
    assert minimal.context_tokens <= starter.context_tokens


def test_known_profile_names() -> None:
    assert set(PROFILES) == {"minimal-16gb", "starter-32gb", "full-64gb"}
