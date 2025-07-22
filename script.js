    // --- Inizializzo MetaMask SDK ---
    const MMSDK = new window.MetaMaskSDK.MetaMaskSDK({
      dappMetadata: { name: "Mokart DApp", url: window.location.href },
      checkInstallationImmediately: false
    });

    let ethereum, provider, signer, contract;
    let currentAccount  = null;
    let userChainId     = null;
    let selectedNFT     = null;
    let currentFn       = null;

    const topbar   = document.getElementById("topbar");
    const main     = document.getElementById("main");
    const btnConnect    = document.getElementById("btnConnect");
    const btnDisconnect = document.getElementById("btnDisconnect");
    const errMsg        = document.getElementById("errorMessage");

    // Config
    const CONTRACT_ADDRESS = "0xd64fe7cebe839a4a5a9dc7bfa51e66296fef1499";
    const SEP_CHAIN_ID     = "0xaa36a7"; // 11155111 in hex
    const RPC_URL_SEPOLIA  = "https://eth-sepolia.g.alchemy.com/v2/Jz-lm1iH4H8eVkfCRSOJX";

    const ERC721_ABI = [
      "function setApprovalForAll(address operator, bool _approved)",
      "function isApprovedForAll(address owner, address operator) view returns (bool)"
    ];
    const ERC1155_ABI = [
      "function setApprovalForAll(address operator, bool approved)",
      "function isApprovedForAll(address account, address operator) view returns (bool)"
    ];

    // ABI completo
    const ABI = [
      {"inputs":[{"internalType":"address","name":"nftContract","type":"address"},{"internalType":"uint256","name":"nftTokenId","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"}],"name":"listItem","outputs":[],"stateMutability":"nonpayable","type":"function"},

{"inputs":[{"internalType":"address","name":"nftContract","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"uint256","name":"startingPrice","type":"uint256"},{"internalType":"uint256","name":"duration","type":"uint256"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"createAuction","outputs":[],"stateMutability":"nonpayable","type":"function"}
    ];

    // Definisco i parametri delle funzioni
    const FIELD_CONFIG = {
      listItem: [
          { name: 'nftContract', label: 'NFT Contract Address', placeholder: '0x…', readonly: true, validation: { required: true } },
          { name: 'nftTokenId', label: 'NFT Token ID', placeholder: 'e.g. 12345', readonly: true, validation: { required: true } },
          { name: 'price', label: 'Prezzo (MKA)', placeholder: 'es. 0.5, 100', readonly: false, validation: { required: true, type: 'decimal', min: 0.1 } },
          { name: 'amount', label: 'Quantità', placeholder: 'es. 1', readonly: false, validation: { required: true, type: 'integer', min: 1 } },
          { name: 'duration', label: 'Durata (giorni)', placeholder: 'es. 1, 7, 30', readonly: false, validation: { required: true, type: 'integer', min: 1, max: 180 } }
      ],

      createAuction: [
          { name: 'nftContract', label: 'NFT Contract Address', placeholder: '0x…', readonly: true, validation: { required: true } },
          { name: 'nftTokenId', label: 'NFT Token ID', placeholder: 'e.g. 12345', readonly: true, validation: { required: true } },
          { name: 'startingPrice', label: 'Prezzo di Partenza (MKA)', placeholder: 'es. 0.5, 100', readonly: false, validation: { required: true, type: 'decimal', min: 0.1 } },
          { name: 'duration', label: 'Durata (giorni)', placeholder: 'es. 1, 7, 30', readonly: false, validation: { required: true, type: 'integer', min: 1, max: 180 } },
          { name: 'amount', label: 'Quantità', placeholder: 'es. 1', readonly: false, validation: { required: true, type: 'integer', min: 1 } }
      ]
    };

    function renderBackButton(onClickFn) {
      // Rimuove eventuali bottoni esistenti
      const old = document.querySelector('.btn-back');
      if (old) old.remove();
      // Crea il nuovo
      const btn = document.createElement('button');
      btn.className = 'btn-back';
      btn.textContent = '← Indietro';
      btn.onclick = onClickFn;
      document.body.appendChild(btn);
    }

    function resetUI() {
      ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      ethereum = null;
      currentAccount = null;
      provider = signer = contract = null;
      btnDisconnect.disabled = true;
      btnDisconnect.style.display = 'none';
      topbar.textContent = "";
      main.innerHTML = `
        <button id="btnConnect" class="btn btn-primary">Connetti MetaMask</button>
        <button id="btnSign" class="btn btn-secondary" disabled>Firma Accesso</button>
        <div id="errorMessage" class="message"></div>
      `;
      const backBtn = document.querySelector('.btn-back');
      if (backBtn) {
        backBtn.style.display = 'none';
      }
      // ricollego i listener ai nuovi bottoni
      document.getElementById("btnConnect").addEventListener("click", onConnectClick);
      document.getElementById("btnSign").addEventListener("click", onSignClick);
    }

    function handleAccountsChanged(accs) {
      if (accs.length) {
        currentAccount = accs[0];
        topbar.textContent = `Connesso: ${currentAccount} – Rete: ${userChainId===SEP_CHAIN_ID?'Sepolia':parseInt(userChainId,16)}`;
      } else {
        resetUI();
      }
    }

    async function onDisconnectClick() {
      try {
        await ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ parentCapability: 'eth_accounts' }],
        });
      } catch (e) {
        errMsg.textContent = `Errore revoca permessi: ${e.message || e}`;
      }
      resetUI();
    }

    async function connectWithSDK() {
      const accounts = await MMSDK.connect();
      ethereum = MMSDK.getProvider();
      ethereum.on("accountsChanged", handleAccountsChanged);

      provider = new ethers.providers.Web3Provider(ethereum);
      signer   = provider.getSigner();

      // Ottengo chainId e, se serve, switch
      let chainId = await provider.send('eth_chainId', []);
      if (chainId !== SEP_CHAIN_ID) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEP_CHAIN_ID }]
          });
          chainId = await provider.send('eth_chainId', []);
        } catch (switchError) {
          // In caso manchi la rete, potresti aggiungerla qui con wallet_addEthereumChain
          errMsg.textContent = `Errore switch network: ${switchError.message || switchError}`;
          throw switchError;
        }
      }

      userChainId = chainId;
      contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      return accounts;
    }

    async function onConnectClick() {
      btnConnect.disabled = true;
      errMsg.textContent = "";
      topbar.textContent = "Connessione in corso…";
      try {
        // Promise che si risolve o rigetta a seconda del connect, oppure scatta il timeout
        const accounts = await Promise.race([
          connectWithSDK(), // la tua funzione già definita
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error("Timeout connessione MetaMask")), 15000)
          )
        ]);
        if (accounts?.length) {
          currentAccount = accounts[0];
          topbar.textContent = `Connesso: ${currentAccount} – Rete: Sepolia`;
          btnDisconnect.disabled = false;
          btnDisconnect.style.display = 'inline-block';
          const btnSign = document.getElementById("btnSign");
          btnSign.disabled = false;
        } else {
          topbar.textContent = "Connessione annullata";
        }
      } catch (e) {
        // Mostra l'errore (timeout, rifiuto, switch chain fallito, ecc.)
        errMsg.textContent = e.message || "Errore sconosciuto durante connessione MetaMask";
        topbar.textContent = "Connessione fallita";
      } finally {
        btnConnect.disabled = false;
      }
    }

    async function onSignClick() {
      const btnSign = document.getElementById("btnSign");
      btnSign.disabled = true;
      errMsg.textContent = "In attesa firma…";
      try {
        const signature = await ethereum.request({
          method: "personal_sign",
          params: ["Firma per accedere a Mokart DApp", currentAccount],
        });
        errMsg.textContent = "";
        showApp(currentAccount, userChainId);
      } catch (err) {
        if (err.code === 4001) {
          errMsg.textContent = "⚠️ Firma annullata dall’utente";
        } else {
          errMsg.textContent = `Errore firma: ${err.message || err}`;
        }
      } finally {
        btnSign.disabled = false;
      }
    }

    // leggo i listener iniziali
    btnConnect.addEventListener("click", onConnectClick);
    btnDisconnect.addEventListener("click", onDisconnectClick);
    btnSign.addEventListener("click", onSignClick);

    // ====== GENERIC APP RENDERING ======
    function showApp(address, chainId) {
      document.querySelector('.btn-back')?.remove();
      // Salvo globalmente indirizzo & chain per i back button
      currentAccount = address;
      userChainId = chainId;
      main.innerHTML = '';
      const networkLabel = chainId === SEP_CHAIN_ID ? 'Sepolia' : `Chain ${parseInt(chainId,16)}`;
      topbar.textContent = `Connesso: ${address} – Rete: ${networkLabel}`;

      // Bottoni separati
      const sellBtn = document.createElement('button');
      sellBtn.className = 'btn btn-write';
      sellBtn.textContent = 'Vendi NFT';
      sellBtn.onclick = () => startProcess('listItem');
      main.appendChild(sellBtn);

      const aucBtn = document.createElement('button');
      aucBtn.className = 'btn btn-write';
      aucBtn.textContent = 'Crea Asta';
      aucBtn.onclick = () => startProcess('createAuction');
      main.appendChild(aucBtn);
    }

    function startProcess(fnName) {
      currentFn = fnName;
      showNFTSelector();
    }

    // 1) Lista e selezione NFT
    async function showNFTSelector() {
      renderBackButton(() => showApp(currentAccount, userChainId));
      main.innerHTML = `
        <div style="display:flex; flex-direction:column; height:70vh;">
          <input id="filterInput" class="filter-input" placeholder="Filtra per nome, id, collezione...">
          <div id="nftGrid" class="nft-grid" style="flex:1;"></div>
        </div>
        <button id="nextBtn" class="btn btn-primary" disabled>Prossimo</button>
      `;

      const address = await signer.getAddress();

      const url = `${RPC_URL_SEPOLIA}/getNFTs?owner=${address}&withMetadata=true`;
      const response = await fetch(url);
      if (!response.ok) {
        // alert(`❌ Alchemy REST error: ${response.status}`);
        errMsg.textContent = `Errore API: ${response.status}`;
        return;
      }
      const data = await response.json();
      // data.ownedNfts contiene l’array degli NFT
      // alert(`✨ Alchemy REST: trovati ${data.ownedNfts.length} NFT`);
      const nfts = data.ownedNfts;

      const grid = document.getElementById('nftGrid');
      const nextBtn = document.getElementById('nextBtn');
      const filter = document.getElementById('filterInput');

      function render(list) {
        grid.innerHTML = '';
        list.forEach(nft => {
          const imgUrl =
            nft.media?.[0]?.gateway ||
            nft.metadata?.image ||
            'https://via.placeholder.com/150?text=No+Image';

          const c = document.createElement('div');
          c.className = 'nft-card';
          c.innerHTML = `
            <img src="${imgUrl}" style="max-width:100%;border-radius:0.3rem;">
            <div>${nft.title||'n/a'}</div>
            <div>ID: ${nft.id.tokenId}</div>`;
          c.onclick = () => {
            document.querySelectorAll('.nft-card').forEach(x=>x.classList.remove('selected'));
            c.classList.add('selected');
            selectedNFT = {
              contract: nft.contract.address,
              tokenId: ethers.BigNumber.from(nft.id.tokenId)
            };
            nextBtn.disabled = false;
          };
          grid.appendChild(c);
        });
      }

      render(nfts);
      filter.oninput = () => {
        const q = filter.value.toLowerCase();
        render(nfts.filter(n =>
          (n.title||'').toLowerCase().includes(q) ||
          n.id.tokenId.includes(q) ||
          (n.contract.address||'').toLowerCase().includes(q)
        ));
      };
      nextBtn.onclick = () => showApprovalScreen();
    }

    // 2) Schermata di approvazione (con check preventivo)
    async function showApprovalScreen() {
      renderBackButton(() => showNFTSelector());
      // 1) Ottieni ABI e contratto NFT
      const abi    = (await isERC1155(selectedNFT.contract)) ? ERC1155_ABI : ERC721_ABI;
      const nftCtr = new ethers.Contract(selectedNFT.contract, abi, signer);

      // 2) Controlla se è già approvato
      const owner     = await signer.getAddress();
      let alreadyOK   = false;
      try {
        alreadyOK = await nftCtr.isApprovedForAll(owner, CONTRACT_ADDRESS);
      } catch(e) {
        errMsg.textContent = `Errore nel check approval: ${e.message || e}`;
      }

      if (alreadyOK) {
        // Salta subito alla form di listItem
        showFunctionForm();
        return;
      }

      // 3) Altrimenti mostra il pulsante di approvazione
      main.innerHTML = `
        <div class="result">Approva il contratto per trasferire i tuoi NFT</div>
        <button id="approveBtn" class="btn btn-primary">Approva</button>
      `;
      document.getElementById('approveBtn').onclick = async () => {
        try {
          const tx = await nftCtr.setApprovalForAll(CONTRACT_ADDRESS, true);
          await tx.wait();
          showFunctionForm();
        } catch(e) {
          errMsg.textContent = `Errore transazione: ${e.message || e}`;
        }
      };
    }

    async function showFunctionForm() {
      renderBackButton(() => showNFTSelector());
      main.innerHTML = '';
      const cfg = FIELD_CONFIG[currentFn];

      // Imposto i valori di default per contratto e tokenId
      cfg[0].default = selectedNFT.contract;
      cfg[1].default = selectedNFT.tokenId.toString();

      // Se non è ERC1155, il campo `amount` diventa readonly e viene forzato a 1
      const is1155 = await isERC1155(selectedNFT.contract);
      const amountField = cfg.find(f => f.name === 'amount');
      amountField.readonly = !is1155;
      if (!is1155) amountField.default = '1';

      // Rendering dei campi
      cfg.forEach((f, i) => {
        const v = f.validation || {};
        main.innerHTML += `
          <div class="form-row">
            <label>${f.label}</label>
            <input
              id="arg-${currentFn}-${i}"
              class="input-field ${f.name==='nftContract'?'input-address':''} ${f.name==='duration'?'duration-field':''}"
              placeholder="${f.placeholder}"
              value="${f.default||''}"
              ${f.readonly ? 'readonly disabled' : ''}
              ${v.required ? 'required' : ''}
              ${v.type==='integer' ? 'type="number" step="1"' : ''}
              ${v.type==='decimal' ? 'type="number" step="any"' : ''}
              ${v.min!=null ? `min="${v.min}"` : ''}
              ${v.max!=null ? `max="${v.max}"` : ''}
            />
          </div>`;
      });

      // Pulsante di submit
      const submit = document.createElement('button');
      submit.className = 'btn btn-write';
      submit.textContent = 'Invia transazione';
      submit.disabled = true;
      main.appendChild(submit);

      // Raccolgo gli input per la validazione
      const inputs = cfg.map((_, i) => document.getElementById(`arg-${currentFn}-${i}`));

      // Funzione di validazione del form
      function validateForm() {
        let ok = true;
        for (let i = 0; i < cfg.length; i++) {
          const f = cfg[i], el = inputs[i], val = el.value.trim();
          if (f.validation?.required && !val) { ok = false; break; }
          if (f.validation?.type === 'integer' && !/^[0-9]+$/.test(val)) { ok = false; break; }
          if (f.validation?.type === 'decimal' && isNaN(Number(val))) { ok = false; break; }
          if (f.validation?.min != null && Number(val) < f.validation.min) { ok = false; break; }
          if (f.validation?.max != null && Number(val) > f.validation.max) { ok = false; break; }
        }
        submit.disabled = !ok;
      }

      // Aggiungo listener agli input
      inputs.forEach(el => el.addEventListener('input', validateForm));
      validateForm(); // primo check

      submit.addEventListener('click', async () => {
        showModal('Invio transazione… attesa conferma Wallet');
        // Disabilita il pulsante per evitare invii multipli
        submit.disabled = true;
        document.getElementById('txCloseBtn').onclick = () => {
          hideModal();
          submit.disabled = false;
        };
        // Preparo gli argomenti: al campo prezzo applico parseUnits
        const args = await Promise.all(cfg.map(async (f, i) => {
          const raw = document.getElementById(`arg-${currentFn}-${i}`).value.trim();
          if ((currentFn === 'listItem' && i === 2) ||
              (currentFn === 'createAuction' && f.name === 'startingPrice')) {
            // converto da (MKA) a wei
            return ethers.utils.parseUnits(raw, 18).toString();
          }
          // Convrte campo duration in secondi (moltiplica gg per 86400)
          if (f.name === 'duration') {
            const days = Number(raw);
            return String(days * 86400);
          }
          return raw;
        }));

        try {
          const tx = await contract[currentFn](...args);
          updateModal('Transazione inviata: ' + tx.hash + '\nAttesa conferma block…');
          const rec = await tx.wait();
          updateModal('✅ Confermato in block ' + rec.blockNumber, true);
        } catch (e) {
          const code = e.code || e.error?.code;
          if (code === 4001 || code === 'ACTION_REJECTED') {
            // Annullo firmato da utente
            updateModal('⚠️ Transazione annullata dall’utente', true);
          } else {
          updateModal('❌ Errore: ' + (e.message || e), true);
          }
        }
      });
    }

    // ====== HELPERS ======
    async function isERC1155(addr) {
      const code = await provider.getCode(addr);
      // semplice heuristica: la stringa “1155” nell’ABI/bytecode
      return code.includes('1155');
    }
    function createResult(txt) {
      const d = document.createElement('div'); d.className = 'result'; d.textContent = txt; return d;
    }
    function removeByClass(cls) {
      document.querySelectorAll('.' + cls).forEach(el => el.remove());
    }

    // --- Modal helper functions ---
    function showModal(message) {
      document.getElementById('txStatus').textContent = message;
      document.getElementById('txCloseBtn').style.display = 'none';
      document.getElementById('txModal').classList.remove('hidden');
    }
    function updateModal(message, showClose = false) {
      document.getElementById('txStatus').textContent = message;
      document.getElementById('txCloseBtn').style.display = showClose ? 'inline-block' : 'none';
    }
    function hideModal() {
      document.getElementById('txModal').classList.add('hidden');
    }

    // Evento per chiusura modal
   document.getElementById('txCloseBtn').onclick = hideModal;
