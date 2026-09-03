from rag_engine.speech import speech_backend_name


def test_speech_backend_is_mlx_on_darwin() -> None:
    assert speech_backend_name("darwin") == "mlx-whisper"


def test_speech_backend_is_faster_whisper_elsewhere() -> None:
    assert speech_backend_name("win32") == "faster-whisper"
    assert speech_backend_name("linux") == "faster-whisper"
