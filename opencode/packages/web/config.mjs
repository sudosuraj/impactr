const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://impactr.ai" : `https://${stage}.impactr.ai`,
  console: stage === "production" ? "https://impactr.ai/auth" : `https://${stage}.impactr.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/impactr",
  discord: "https://impactr.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
