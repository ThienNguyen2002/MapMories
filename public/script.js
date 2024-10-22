var detailsBox = document.getElementById('details-box');
var countdownElement = document.createElement('div');
countdownElement.id = 'countdown';
document.body.appendChild(countdownElement);

let hoverTimer;
let currentHoveredState;
let isModalOpen = false;

// Function to get or create user ID
function getUserId() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('userId', userId);
    }
    return userId;
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        const { userId, userState } = await identifyUser();
        console.log(`User ID: ${userId}, State: ${userState}`);

        if (userState) {
            // Add a small delay to ensure the SVG is loaded
            setTimeout(() => {
                const statePath = document.querySelector(`path[id="${userState}"]`);
                if (statePath) {
                    statePath.classList.add('user-state');
                }
            }, 500);
        }

        // Set up modal close button
        const closeBtn = document.querySelector('.close');
        closeBtn.onclick = closeModal;
    } catch (error) {
        console.error('Error during initialization:', error);
    }
});

document.addEventListener('mouseover', function (e) {
    if (e.target.tagName === 'path' && !isModalOpen) {
        currentHoveredState = e.target;
        startHoverCountdown();
    }
});

document.addEventListener('mouseout', function (e) {
    if (e.target.tagName === 'path') {
        clearHoverCountdown();
    }
});

function startHoverCountdown() {
    clearHoverCountdown();
    let countdown = 3;
    countdownElement.style.display = 'block';
    countdownElement.style.left = (event.clientX + 10) + 'px';
    countdownElement.style.top = (event.clientY + 10) + 'px';

    function updateCountdown() {
        countdownElement.textContent = countdown;
        if (countdown > 0) {
            countdown--;
            hoverTimer = setTimeout(updateCountdown, 1000);
        } else {
            showStateDetails(currentHoveredState);
        }
    }

    updateCountdown();
}

function clearHoverCountdown() {
    clearTimeout(hoverTimer);
    countdownElement.style.display = 'none';
    detailsBox.style.opacity = "0%";
}

function showStateDetails(statePath) {
    var content = statePath.dataset.name;
    detailsBox.innerHTML = content;
    detailsBox.style.opacity = "100%";
    openModal(content);
}

function openModal(stateName) {
    if (isModalOpen) return;
    
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalContent = document.getElementById('modal-content');
    const uploadForm = document.getElementById('upload-form');

    modalTitle.textContent = stateName;
    
    // Fetch and display images
    fetchAndDisplayImages(stateName);

    // Set up the upload form
    uploadForm.onsubmit = function(e) {
        e.preventDefault();
        const formData = new FormData(uploadForm);
        formData.append('state', stateName);

        fetch('/api/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                alert('Image uploaded successfully!');
                // Refresh the image feed after upload
                fetchAndDisplayImages(stateName);
            } else {
                throw new Error('Upload failed');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Failed to upload image: ' + error.message);
        });
    };

    modal.style.display = 'block';
    isModalOpen = true;
}

function fetchAndDisplayImages(stateName) {
    const userId = getUserId();
    console.log('Fetching images for user:', userId);

    fetch(`/api/images/${stateName}?userId=${userId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(images => {
            console.log('Received images:', images);
            if (images.length === 0) {
                document.getElementById('modal-content').innerHTML = 
                    '<p>No images available for this state. Be the first to upload one!</p>';
            } else {
                displayImages(images);
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            document.getElementById('modal-content').innerHTML = 
                `<p>Error loading images: ${error.message}</p>`;
        });
}

function displayImages(images) {
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = '';

    const filterContainer = document.createElement('div');
    filterContainer.innerHTML = `
        <select id="sort-select">
            <option value="date">Sort by Date</option>
            <option value="popularity">Sort by Popularity</option>
        </select>
    `;
    modalContent.appendChild(filterContainer);

    const imageGrid = document.createElement('div');
    imageGrid.className = 'image-grid';
    modalContent.appendChild(imageGrid);

    function renderImages() {
        imageGrid.innerHTML = '';
        const userId = getUserId(); // Get current user ID

        images.forEach(image => {
            console.log('Image data:', image); // Debug log
            
            const imageElement = document.createElement('div');
            imageElement.className = 'image-item';
            
            // Check for user's vote on this image
            const userVote = image.userVote;
            console.log(`User ${userId} vote for image ${image.key}:`, userVote);

            imageElement.innerHTML = `
                <img src="${image.url}" alt="State Image">
                <div class="image-info">
                    <span class="timestamp">${new Date(image.timestamp).toLocaleString()}</span>
                    <div class="vote-buttons">
                        <button class="upvote ${userVote === 'up' ? 'voted' : ''}" 
                                data-key="${image.key}" 
                                data-current-vote="${userVote || ''}">
                            👍 ${image.upvotes || 0}
                        </button>
                        <button class="downvote ${userVote === 'down' ? 'voted' : ''}" 
                                data-key="${image.key}" 
                                data-current-vote="${userVote || ''}">
                            👎 ${image.downvotes || 0}
                        </button>
                    </div>
                    <button class="flag ${image.flagged ? 'flagged' : ''}" data-key="${image.key}">🚩</button>
                </div>
            `;
            imageGrid.appendChild(imageElement);
        });

        // Add event listeners for voting and flagging
        document.querySelectorAll('.upvote, .downvote').forEach(button => {
            button.addEventListener('click', handleVote);
        });
        document.querySelectorAll('.flag').forEach(button => {
            button.addEventListener('click', handleFlag);
        });
    }

    renderImages();

    // Add event listener for sorting
    document.getElementById('sort-select').addEventListener('change', (e) => {
        if (e.target.value === 'date') {
            images.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        } else {
            images.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        }
        renderImages();
    });
}

function handleVote(e) {
    const key = e.target.dataset.key;
    const voteType = e.target.classList.contains('upvote') ? 'up' : 'down';
    const userId = getUserId();

    // Find both buttons
    const upvoteButton = e.target.classList.contains('upvote') ? e.target : e.target.previousElementSibling;
    const downvoteButton = e.target.classList.contains('downvote') ? e.target : e.target.nextElementSibling;

    // Determine current vote
    let currentVote = null;
    if (upvoteButton.classList.contains('voted')) currentVote = 'up';
    if (downvoteButton.classList.contains('voted')) currentVote = 'down';

    // If clicking the same vote type that's already active, do nothing
    if (currentVote === voteType) {
        return;
    }

    console.log('Attempting to vote:', { key, voteType, currentVote, userId });

    fetch('/api/vote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key, voteType, currentVote, userId }),
    })
    .then(response => {
        console.log('Vote response status:', response.status);
        if (!response.ok) {
            return response.json().then(err => { throw err; });
        }
        return response.json();
    })
    .then(data => {
        console.log('Vote response data:', data);
        if (data.success) {
            // Update vote counts
            upvoteButton.textContent = `👍 ${data.upvotes}`;
            downvoteButton.textContent = `👎 ${data.downvotes}`;

            // Update button styles
            upvoteButton.classList.toggle('voted', data.userVote === 'up');
            downvoteButton.classList.toggle('voted', data.userVote === 'down');

            console.log('Updated vote UI:', {
                upvotes: data.upvotes,
                downvotes: data.downvotes,
                userVote: data.userVote
            });
        } else {
            console.error('Vote was not successful:', data);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to update vote: ' + (error.error || error.message));
    });
}

function handleFlag(e) {
    const key = e.target.dataset.key;

    fetch('/api/flag', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            e.target.classList.add('flagged');
            alert('Image has been flagged for review.');
        }
    })
    .catch(error => console.error('Error:', error));
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.style.display = 'none';
    isModalOpen = false;
}

// Close modal when clicking outside of it
window.onclick = function(event) {
    const modal = document.getElementById('modal');
    if (event.target == modal) {
        closeModal();
    }
}

window.onmousemove = function (e) {
    var x = e.clientX,
        y = e.clientY;
    detailsBox.style.top = (y + 20) + 'px';
    detailsBox.style.left = (x) + 'px';
};