const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://impactr.dev" : `https://${stage}.impactr.dev`,
  console: stage === "production" ? "https://impactr.dev/auth" : `https://${stage}.impactr.dev/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/impactr",
  discord: "https://impactr.dev/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
