# LegacyDataTool

Small dependency-free .NET 8 utility implementing the recovered encrypted
container and legacy hash. Run it only through the project-local Nix environment:

```sh
reverse-engineering/tools/legacy-data.sh info \
  CBLoader/Cache/combined.dnd40.encrypted

reverse-engineering/tools/legacy-data.sh decrypt \
  CBLoader/Cache/combined.dnd40.encrypted /tmp/decrypted.xml \
  CharacterBuilder/HeroicDemo.update

reverse-engineering/tools/legacy-data.sh legacy-hash /tmp/decrypted.xml
```

Key input may be `HeroicDemo.update`, namespaced `CBLoaderKeyStore` XML, or a file
containing one base64 fallback key. The update-specific key is preferred.

Verification against the supplied container produced:

- update GUID `19806aaa-6d71-425d-9dcf-54e6bb6b1e57`;
- plaintext SHA-256
  `1941ae2805160aaf8e92b0ba60a0be3f3af16471b6dbcc689776375ffa0c4291`;
- legacy hash `0x150e178e` (`353245070`, the recovered October 2010 demo hash);
- 37,406 rule records and the CBLoader hash-fix marker.

Encryption is nondeterministic at the GZip-header level on some runtimes, so test
encrypt/decrypt round trips by plaintext bytes/semantics, not ciphertext digest.
