from pathlib import Path
from unittest.mock import MagicMock

import pytest

from rag_engine.speech.backend import (
    FASTER_WHISPER_MODEL,
    MLX_WHISPER_REPO,
    speech_backend_name,
    stt_model_id,
)
from rag_engine.speech.sentences import flush_completed_sentences, force_flush_remainder
from rag_engine.speech.stt import create_speech_to_text, transcribe_wav_bytes
from rag_engine.speech.voices import parse_app_locale, voice_for_locale
from rag_engine.speech.wav import (
    WavValidationError,
    assert_transcribable_wav,
    load_pcm16_mono_float32,
    pcm16_mono_wav_bytes,
    write_wav_temp,
)


def test_speech_backend_is_mlx_on_darwin() -> None:
    assert speech_backend_name("darwin") == "mlx-whisper"


def test_speech_backend_is_faster_whisper_elsewhere() -> None:
    assert speech_backend_name("win32") == "faster-whisper"
    assert speech_backend_name("linux") == "faster-whisper"


def test_stt_model_id_uses_profile_on_darwin_and_faster_elsewhere() -> None:
    assert stt_model_id(platform="darwin", profile_stt=MLX_WHISPER_REPO) == MLX_WHISPER_REPO
    assert stt_model_id(platform="win32", profile_stt=MLX_WHISPER_REPO) == FASTER_WHISPER_MODEL
    assert stt_model_id(platform="linux") == FASTER_WHISPER_MODEL


def test_create_speech_to_text_picks_backend_by_platform() -> None:
    mlx = create_speech_to_text(platform="darwin")
    faster = create_speech_to_text(platform="win32")
    assert type(mlx).__name__ == "_MlxWhisperStt"
    assert type(faster).__name__ == "_FasterWhisperStt"


def test_wav_rejects_non_wave_and_wrong_rate() -> None:
    with pytest.raises(WavValidationError):
        assert_transcribable_wav(b"not-a-wav")
    bad_rate = pcm16_mono_wav_bytes(b"\x00\x00" * 100)
    # Corrupt sample rate in header (bytes 24-27 little-endian).
    mangled = bytearray(bad_rate)
    mangled[24:28] = (8_000).to_bytes(4, "little")
    with pytest.raises(WavValidationError, match="16000"):
        assert_transcribable_wav(bytes(mangled))


def test_wav_accepts_16k_mono_pcm() -> None:
    data = pcm16_mono_wav_bytes(b"\x00\x00" * 1600)
    assert_transcribable_wav(data)


def test_load_pcm16_mono_float32_scales_samples(tmp_path: Path) -> None:
    # One full-scale sample (+32767) → ~1.0 float.
    data = pcm16_mono_wav_bytes((32767).to_bytes(2, "little", signed=True))
    path = write_wav_temp(data)
    try:
        samples = load_pcm16_mono_float32(path)
    finally:
        path.unlink(missing_ok=True)
    assert len(samples) == 1
    assert samples[0] == pytest.approx(32767 / 32768.0)


def test_transcribe_wav_bytes_uses_stt_and_deletes_temp(tmp_path: Path) -> None:
    data = pcm16_mono_wav_bytes(b"\x00\x00" * 800)
    stt = MagicMock()
    stt.transcribe.return_value = "  hello rules  "
    text = transcribe_wav_bytes(data, stt=stt, language="pl")
    assert text == "hello rules"
    stt.transcribe.assert_called_once()
    path_arg: Path = stt.transcribe.call_args[0][0]
    assert path_arg.suffix == ".wav"
    assert not path_arg.exists()
    assert stt.transcribe.call_args.kwargs.get("language") == "pl"


def test_flush_completed_sentences_keeps_remainder() -> None:
    done, rest = flush_completed_sentences("Hello world. Next")
    assert done == ["Hello world."]
    assert rest == "Next"


def test_flush_completed_sentences_handles_closers() -> None:
    done, rest = flush_completed_sentences('He said "Go." Then')
    assert done == ['He said "Go."']
    assert rest == "Then"


def test_force_flush_remainder() -> None:
    assert force_flush_remainder("  trailing  ") == ["trailing"]
    assert force_flush_remainder("   ") == []


def test_voice_for_locale_and_parse() -> None:
    assert voice_for_locale("pl") == "pl_PL-bass-high"
    assert voice_for_locale("en") == "en_US-lessac-medium"
    assert parse_app_locale("pl-PL") == "pl"
    assert parse_app_locale("de") == "en"
    assert parse_app_locale(None) == "en"
