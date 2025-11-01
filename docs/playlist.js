async function fetchAndProcessPlaylist() {
    try {
        const [currentSongTitle, queueTitles] = await Promise.all([
            fetchCurrentSong(),
            fetchQueueSongs()
        ]);

        updateUI(currentSongTitle, queueTitles);
    } catch (error) {
        console.error("An error occurred while fetching or processing the playlist:", error);
    }
}

async function fetchCurrentSong() {
    const response = await fetch("https://logs.ivr.fi/channel/quin69/user/sheepfarmer/?reverse");
    const text = await response.text();
    const lines = text.split("\n");
    return parseCurrentSong(lines);
}

async function fetchQueueSongs() {
    const chatEntries = await readNewChatEntries();
    return parseSongs(chatEntries);
}

function parseCurrentSong(lines) {
    for (const line of lines) {
        if (line.includes("The stream is offline. Clearing the spotify request queue.")) {
            localStorage.removeItem("lastMatchingIndex");
        }
        if (line.includes("🔊") && !line.includes("VIBE")) {
            return line.substring(line.indexOf("🔊") + 2).trim();
        }
    }
    return null;
}

function parseSongs(chatEntries) {
    return chatEntries
        .filter(entry => entry.includes("custom-reward-id=c6a37c56-beaa-4752-90c8-e18efacfeaba"))
        .map(entry => {
            const parts = entry.split(" :");
            return parts.length >= 3 ? parts[parts.length - 1].trim() : null;
        })
        .filter(Boolean)
        .reverse();
}

async function readNewChatEntries() {
    try {
        const { dateKey, songsKey, offsetKey } = await getDateKeys();
        const dateOffset = localStorage.getItem(offsetKey) || 0;

        const response = await fetch(`https://logs.ivr.fi/channel/quin69?raw&offset=${dateOffset}`);
        let text = "";
        if (response.status !== 404) {
            text = await response.text();
        }
        const lines = text.split("\n").filter(Boolean);

        const filteredLines = lines.filter(line =>
            line.includes("custom-reward-id=c6a37c56-beaa-4752-90c8-e18efacfeaba")
        );

        let songsArray = [];
        const existingSongs = localStorage.getItem(songsKey);
        if (existingSongs) {
            try {
                songsArray = JSON.parse(existingSongs);
                if (!Array.isArray(songsArray)) {
                    songsArray = [];
                }
            } catch (e) {
                songsArray = [];
            }
        }
        songsArray = songsArray.concat(filteredLines);
        localStorage.setItem(songsKey, JSON.stringify(songsArray));

        const newOffset = parseInt(dateOffset) + lines.length;
        localStorage.setItem(offsetKey, newOffset);

        clearOldEntries(dateKey);

        return songsArray;
    } catch (error) {
        console.error("An error occurred while parsing queue titles:", error);
        return [];
    }
}

async function getDateKeys() {
    const headResponse = await fetch("https://logs.ivr.fi/channel/quin69?raw", {
        method: "HEAD",
        redirect: "follow"
    });

    const redirectedUrl = headResponse.url;
    const urlObj = new URL(redirectedUrl);
    const segments = urlObj.pathname.split("/");

    if (segments.length < 6) {
        throw new Error("Unexpected URL format: " + redirectedUrl);
    }

    const [_, __, ___, year, month, day] = segments;
    const dateKey = `${year}-${month}-${day}`;

    return {
        dateKey,
        songsKey: `requestSongs-${dateKey}`,
        offsetKey: `requestSongsOffset-${dateKey}`
    };
}

function clearOldEntries(currentDateKey) {
    const [curYear, curMonth, curDay] = currentDateKey.split("-").map(Number);
    const currentDate = new Date(curYear, curMonth - 1, curDay);

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("requestSongs-") || key.startsWith("requestSongsOffset-"))) {
            // Extract the date part from the key.
            let datePart = "";
            if (key.startsWith("requestSongs-")) {
                datePart = key.substring("requestSongs-".length);
            } else if (key.startsWith("requestSongsOffset-")) {
                datePart = key.substring("requestSongsOffset-".length);
            }
            const parts = datePart.split("-");
            if (parts.length === 3) {
                const keyDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                // Remove entries for days that are two or more days older than the current date from the redirected URL.
                const diffTime = currentDate - keyDate;
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                if (diffDays >= 2) {
                    keysToRemove.push(key);
                }
            }
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
}

function updateUI(currentSongTitle, queueTitles) {
    displayCurrentSong(currentSongTitle);
    displayQueue(queueTitles, currentSongTitle);
}

function displayCurrentSong(song) {
    const currentSongElement = document.getElementById("currentSong");
    currentSongElement.innerHTML = "";

    if (song) {
        const link = document.createElement("a");
        link.textContent = song;
        link.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
        link.target = "_blank";

        currentSongElement.appendChild(link);
    } else {
        currentSongElement.textContent = "No song is currently playing.";
    }
}

function displayQueue(queue, currentSong) {
    const queueElement = document.getElementById("queue");
    queueElement.innerHTML = "";

    let songFound = false;
    let index = 0;
    const lastMatchingIndexKey = "lastMatchingIndex";

    for (const song of queue) {
        if (song === currentSong) {
            songFound = true;
            break;
        }

        // Split songs on " - " to extract artist and title
        const songParts = song.split(" - ").map(s => s.trim().toLowerCase());
        const currentParts = currentSong.split(" - ").map(s => s.trim().toLowerCase());

        if (songParts.length >= 2 && currentParts.length >= 2) {
            const [songArtist, songTitle] = songParts;
            const [currentArtist, currentTitle] = currentParts;

            // Check for both full match and reversed match (in case order is swapped)
            if ((songArtist === currentArtist && songTitle === currentTitle) ||
                (songArtist === currentTitle && songTitle === currentArtist)) {
                songFound = true;
                break;
            }

            // As a last resort, return true if either artist or title matches
            if (songArtist === currentArtist || songTitle === currentTitle ||
                songArtist === currentTitle || songTitle === currentArtist) {
                songFound = true;
                break;
            }

            // This might be too leniant but with messy requests it's the only way
            if (song.includes(currentTitle)) {
                songFound = true;
                break;
            }
        }

        index++;
    }

    // If a match was found, save the index for future reference.
    if (songFound) {
        localStorage.setItem(lastMatchingIndexKey, index);
    } else {
        // No match was found in this run; try to fall back to the last matching index
        const storedIndex = localStorage.getItem(lastMatchingIndexKey);
        if (storedIndex !== null) {
            index = parseInt(storedIndex, 10);
        } else {
            return;
        }
    }

    const table = document.createElement("table");
    let songsCount = 1;
    for (let i = index - 1; i >= 0; i--) {
        const tr = document.createElement("tr");
        const tdTitle = document.createElement("td");
        const tdTime = document.createElement("td");

        const song = queue[i];
        const link = document.createElement("a");
        link.textContent = song;
        link.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(song)}`;
        link.target = "_blank";

        tdTitle.appendChild(link);
        tdTime.textContent = `➡️ ${getEstimatedTime(songsCount)}`;
        tdTime.style.whiteSpace = "nowrap";

        tr.appendChild(tdTitle);
        tr.appendChild(tdTime);
        table.appendChild(tr);

        songsCount++;
    }

    queueElement.appendChild(table);

    if (queueElement.childElementCount === 0) {
        const emptyMessage = document.createElement("li");
        emptyMessage.textContent = "The stream is currently not using song request.";
        queueElement.appendChild(emptyMessage);
    }

    displayTotalEstimatedTime(songsCount);
}

function displayTotalEstimatedTime(songs) {
    const element = document.getElementById("estimatedTime");
    element.innerHTML = "Estimated total time of playlist: " + getEstimatedTime(songs);
}

function getEstimatedTime(songs) {
    return minutesToHoursMinutesSeconds(songs * 3.28);
}

function minutesToHoursMinutesSeconds(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return hours <= 0 ? `${remainingMinutes}m` : `${hours}h ${remainingMinutes}m`;
}

window.onload = fetchAndProcessPlaylist;

const updateInterval = 1 * 60 * 1000;
const intervalId = setInterval(fetchAndProcessPlaylist, updateInterval);
