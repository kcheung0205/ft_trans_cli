# CLI Client for 42's ft_transcendence

This is a **command-line client** for our 42 ft_transcendence project that runs in Node.js using the **blessed** library.
⚠️ Note: This client is **not universal** and works only on our group's server.

---

## Usage

### Option 1: Run with Docker
- Install Docker on your system.  
- Run `make`  
- To clean up containers and images, run `make clean`  

### Option 2: Run locally with Node.js
- Install Node.js and npm.  
- Install dependencies: `npm install axios ws blessed`  
- Start the client: `node cli.js`  

---

## Notes
- This CLI is a lightweight alternative to the web client. 
- Works only with our ft_transcendence server setup, unless another server uses the same endpoints.