const MMSDK = new window.MetaMaskSDK.MetaMaskSDK({
  dappMetadata: { name: "Pure JS dApp", url: window.location.href },
  checkInstallationImmediately: false
});

let ethereum, currentAccount;

const statusEl      = document.getElementById("status");
const btnConnect    = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const btnSign       = document.getElementById("btnSign");
const sigEl         = document.getElementById("signature");

function resetUI() {
  ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
  ethereum = null;
  currentAccount = null;
  statusEl.textContent = "Stato: Disconnesso";
  btnSign.disabled = btnDisconnect.disabled = true;
}

function handleAccountsChanged(accs) {
  if (accs.length) {
    currentAccount = accs[0];
    statusEl.textContent = "Connesso: " + currentAccount;
  } else {
    resetUI();
  }
}

async function handleDisconnectClick() {
  try {
    await ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ parentCapability: 'eth_accounts' }],
    });
  } catch (e) {
    console.warn("Revoca permessi fallita:", e);
  }
  resetUI();
}

async function connect() {
  const accounts = await MMSDK.connect();
  ethereum = MMSDK.getProvider();
  ethereum.on("accountsChanged", handleAccountsChanged);
  return accounts;
}

btnConnect.addEventListener("click", async () => {
  btnConnect.disabled = true;
  statusEl.textContent = "Connessione in corso…";
  try {
    const accounts = await connect();
    if (accounts?.length) {
      currentAccount = accounts[0];
      statusEl.textContent = "Connesso: " + currentAccount;
      btnSign.disabled = btnDisconnect.disabled = false;
    } else {
      statusEl.textContent = "Connessione annullata";
    }
  } catch (err) {
    console.error("Errore connect:", err);
    resetUI();
  } finally {
    btnConnect.disabled = false;
  }
});

btnDisconnect.addEventListener("click", handleDisconnectClick);

btnSign.addEventListener("click", async () => {
  btnSign.disabled = true;
  sigEl.textContent = "In attesa firma…";
  try {
    const sig = await ethereum.request({
      method: "personal_sign",
      params: ["Autenticazione dApp", currentAccount],
    });
    sigEl.textContent = "Signature: " + sig;
  } catch (err) {
    console.error("Errore firma:", err);
    sigEl.textContent = "Firma fallita";
  } finally {
    btnSign.disabled = false;
  }
});
