# Folio for KOReader

Folio Kindle 0.1.0 adds a Portuguese **Folio** menu to KOReader. It connects the existing OPDS catalog with the independently installed [Audiobook Read-Along](https://github.com/stradichenko/audiobook.koplugin) plugin, including its voice, playback, read-along and Bluetooth controls. Audiobook Read-Along retains its own AGPL-3.0 license and is not included in this MIT-licensed extension.

Copy `folio.koplugin` into `koreader/plugins`, install Audiobook Read-Along separately, and restart KOReader. Pair Bluetooth headphones through Amazon's Kindle settings before starting narration. Open an EPUB, select a passage and choose **Read aloud from here**, or use **Folio → Áudio, vozes e leitura acompanhada** to access the audio plugin's full menu. In KOReader's library, **Folio → Receber livros do celular** opens the OPDS browser; add the URL displayed by Folio Android's **More → Connect Kindle** screen.

The 2019 KT4 currently has limited free storage. The local device installation uses the upstream audio release v0.2.21 without the optional `piper/` directory. eSpeak and sanoTTS remain included. eSpeak provides Portuguese and English; the bundled sanoTTS voices are mainly English. Installing the full upstream update or downloading neural voice models requires more free storage. No books need to be deleted to install this compact configuration.

This extension does not yet synchronize positions, notes, statistics, AI conversations, or updates with Folio Android. It delegates audio to the upstream plugin; playback and automatic page following require verification with actual headphones on the device. Closing KOReader is necessary before USB file transfer on this Kindle.
