import { transcribeRealtime } from '../util/audio-perception.mjs';
import { resample } from 'codecs/resample.mjs';
import { AudioChunker } from '../util/audio-chunker.mjs';

//

export class TranscribedVoiceInput extends EventTarget {
  // static transcribeSampleRate = 24000;
  static transcribeSampleRate = 16000;
  abortController;
  constructor({
    audioInput,
    sampleRate,
    codecs,
    jwt,
  }) {
    if (!audioInput) {
      throw new Error('no audio input');
    }
    if (!sampleRate) {
      throw new Error('no sample rate');
    }
    if (!codecs) {
      throw new Error('no codecs');
    }
    if (!jwt) {
      throw new Error('no jwt');
    }

    super();

    this.abortController = new AbortController();
    const {
      signal,
    } = this.abortController;

    (async () => {
      const transcription = transcribeRealtime({
        sampleRate: TranscribedVoiceInput.transcribeSampleRate,
        codecs,
        jwt,
      });
      transcription.addEventListener('speechstart', e => {
        this.dispatchEvent(new MessageEvent('speechstart', {
          data: e.data,
        }));
      });
      transcription.addEventListener('speechstop', e => {
        this.dispatchEvent(new MessageEvent('speechstop', {
          data: e.data,
        }));
      });
      transcription.addEventListener('speechcancel', e => {
        this.dispatchEvent(new MessageEvent('speechcancel', {
          data: e.data,
        }));
      });
      transcription.addEventListener('transcription', e => {
        this.dispatchEvent(new MessageEvent('transcription', {
          data: e.data,
        }));
      });
      signal.addEventListener('abort', () => {
        transcription.close();
      });

      const openPromise = new Promise((accept, reject) => {
        transcription.addEventListener('open', e => {
          accept(null);
        });
        transcription.addEventListener('error', e => {
          reject(e);
        });
      });

      const audioChunker = new AudioChunker({
        sampleRate: TranscribedVoiceInput.transcribeSampleRate,
        chunkSize: 1536,
      });
      const ondata = async (f32) => {
        await openPromise;

        // resample if needed
        if (sampleRate !== TranscribedVoiceInput.transcribeSampleRate) {
          f32 = resample(f32, sampleRate, TranscribedVoiceInput.transcribeSampleRate);
        }

        const frames = audioChunker.write(f32);
        for (const frame of frames) {
          transcription.write(frame);
        }
      };
      audioInput.on('data', ondata);

      const cleanup = () => {
        signal.addEventListener('abort', () => {
          audioInput.removeListener('data', ondata);
        });
      };
      signal.addEventListener('abort', () => {
        cleanup();
      });
    })();
  }
  close() {
    this.abortController.abort();
    this.dispatchEvent(new MessageEvent('close', {
      data: null,
    }));
  }
}