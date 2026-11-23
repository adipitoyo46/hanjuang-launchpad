# Hanjuang Token (HJNG) — Ammora Builder Mission

Project Builder Mission Ammora Protocol untuk token **Hanjuang Token (HJNG)** di GIWA Sepolia (chain ID 91342).

Seluruh build ditulis dari nol di atas SDK resmi `@ammora-protocol/sdk` v0.3.9 — tanpa menyalin repo contoh mana pun. Skrip-skrip di `src/` melakukan:

1. `src/01-config.ts` — membuat Team Config baru di registry Ammora (semua peran = wallet penerbit).
2. `src/02-launch.ts` — menerbitkan token HJNG lewat factory (`createLaunchWithTokenConfig`).
3. `src/03-firstbuy.ts` — pembelian pertama: wrap ETH → WETH, approve persis, lalu `swapExactInput` di kurva.

## Hasil build (terverifikasi on-chain)

| Item | Nilai |
|---|---|
| Config ID | 86 |
| Config hash | `0xda8f3689be987a8e7cc70b9a338622533d5dc147d416f1ae4d0487bcf3be33e4` |
| Token HJNG | `0xc42100437E374E998d6ed573e72d55b660378615` |
| Kurva (ALC) | `0x189dfCb3ebc7Ea965c25A5c43420EBd89e076eb5` |
| Pembelian pertama | 0,0005 WETH → 961.534,73 HJNG |
| Situs | https://adipitoyo46.github.io/hanjuang-launchpad/ |

Situs project ada di `index.html` (GitHub Pages). HJNG berjalan di testnet dan tidak memiliki nilai finansial.
