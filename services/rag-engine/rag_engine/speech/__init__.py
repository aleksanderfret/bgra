"""Speech-to-text and text-to-speech for Stage 5 voice.

mlx-whisper on Apple Silicon; faster-whisper elsewhere. Piper for spoken answers.
Selecting the backend here keeps Windows from being a surprise at the router.
"""

from __future__ import annotations

from rag_engine.speech.backend import (
    FASTER_WHISPER_MODEL,
    MLX_WHISPER_REPO,
    SpeechExtraMissingError,
    speech_backend_name,
    stt_model_id,
)
from rag_engine.speech.sentences import flush_completed_sentences, force_flush_remainder
from rag_engine.speech.stt import SpeechToText, create_speech_to_text, transcribe_wav_bytes
from rag_engine.speech.tts import AUDIO_MIME_WAV, clear_piper_voice_cache, synthesize_sentence_wav
from rag_engine.speech.voices import (
    TTS_VOICE_EN,
    TTS_VOICE_PL,
    AppLocale,
    ensure_piper_voice,
    parse_app_locale,
    voice_for_locale,
    voice_is_ready,
)
from rag_engine.speech.wav import (
    MAX_WAV_BYTES,
    WavValidationError,
    assert_transcribable_wav,
    pcm16_mono_wav_bytes,
    write_wav_temp,
)

__all__ = [
    "AUDIO_MIME_WAV",
    "FASTER_WHISPER_MODEL",
    "MAX_WAV_BYTES",
    "MLX_WHISPER_REPO",
    "TTS_VOICE_EN",
    "TTS_VOICE_PL",
    "AppLocale",
    "SpeechExtraMissingError",
    "SpeechToText",
    "WavValidationError",
    "assert_transcribable_wav",
    "clear_piper_voice_cache",
    "create_speech_to_text",
    "ensure_piper_voice",
    "flush_completed_sentences",
    "force_flush_remainder",
    "parse_app_locale",
    "pcm16_mono_wav_bytes",
    "speech_backend_name",
    "stt_model_id",
    "synthesize_sentence_wav",
    "transcribe_wav_bytes",
    "voice_for_locale",
    "voice_is_ready",
    "write_wav_temp",
]
