import { aniListData } from "@/lib/anilist/AniList";
import { useState, useEffect, Fragment } from "react";
import Head from "next/head";
import Link from "next/link";
import Footer from "@/components/shared/footer";
import Image from "next/image";
import Content from "@/components/home/content";

import { motion } from "framer-motion";

import { signOut, useSession } from "next-auth/react";
import Genres from "@/components/home/genres";
import Schedule from "@/components/home/schedule";
import getUpcomingAnime from "@/lib/anilist/getUpcomingAnime";

import GetMedia from "@/lib/anilist/getMedia";
// import UserRecommendation from "../../components/home/recommendation";
import MobileNav from "@/components/shared/MobileNav";
import { getGreetings } from "@/utils/getGreetings";
import { redis } from "@/lib/redis";
import { NewNavbar } from "@/components/shared/NavBar";
import { checkAdBlock } from "adblock-checker";
import { toast } from "sonner";
import { unixTimestampToRelativeTime } from "@/utils/getTimes";

export async function getServerSideProps() {
  let cachedData;

  if (redis) {
    cachedData = await redis.get("index_server");
  }

  if (cachedData) {
    const { genre, detail, populars } = JSON.parse(cachedData);
    const upComing = await getUpcomingAnime();
    return {
      props: {
        genre,
        detail,
        populars,
        upComing,
      },
    };
  } else {
    const trendingDetail = await aniListData({
      sort: "TRENDING_DESC",
      page: 1,
    });
    const popularDetail = await aniListData({
      sort: "POPULARITY_DESC",
      page: 1,
    });
    const genreDetail = await aniListData({ sort: "TYPE", page: 1 });

    if (redis) {
      await redis.set(
        "index_server",
        JSON.stringify({
          genre: genreDetail.props,
          detail: trendingDetail.props,
          populars: popularDetail.props,
        }), // set cache for 2 hours
        "EX",
        60 * 60 * 2
      );
    }

    const upComing = await getUpcomingAnime();

    return {
      props: {
        genre: genreDetail.props,
        detail: trendingDetail.props,
        populars: popularDetail.props,
        upComing,
      },
    };
  }
}

export default function Home({ detail, populars, upComing }) {
  const { data: sessions } = useSession();
  const { anime: currentAnime, manga: currentManga } = GetMedia(sessions, {
    stats: "CURRENT",
  });
  const { anime: plan } = GetMedia(sessions, { stats: "PLANNING" });
  const { anime: release } = GetMedia(sessions);

  const [schedules, setSchedules] = useState(null);
  const [anime, setAnime] = useState([]);

  const [recentAdded, setRecentAdded] = useState([]);

  useEffect(() => {
    async function adBlock() {
      const ad = await checkAdBlock();
      if (ad) {
        toast.message(
          `Please disable your adblock for better experience, we don't have any ads on our site.`,
          {
            position: "bottom-right",
            important: true,
            duration: 100000,
            className: "flex-center font-karla text-white",
          }
        );
      }
    }
    adBlock();
  }, []);

  async function getRecent() {
    const data = await fetch(`/api/v2/etc/recent/1`)
      .then((res) => res.json())
      .catch((err) => console.log(err));

    setRecentAdded(data?.results);
  }

  useEffect(() => {
    if (sessions?.user?.version) {
      if (sessions.user.version !== "1.0.1") {
        signOut("AniListProvider");
      }
    }
  }, [sessions?.user?.version]);

  useEffect(() => {
    getRecent();
  }, []);

  const update = () => {
    setAnime((prevAnime) => prevAnime.slice(1));
  };

  useEffect(() => {
    if (upComing && upComing.length > 0) {
      setAnime(upComing);
    }
  }, [upComing]);

/*  useEffect(() => {
    const getSchedule = async () => {
      try {
        const res = await fetch(`/api/v2/etc/schedule`);
        const data = await res.json();

        if (!res.ok) {
          setSchedules(null);
        } else {
          setSchedules(data);
        }
      } catch (err) {
        console.log(err);
      }
    };
    getSchedule();
  }, []);*/

  const [releaseData, setReleaseData] = useState([]);

  useEffect(() => {
    function getRelease() {
      let releasingAnime = [];
      let progress = [];
      let seenIds = new Set(); // Create a Set to store the IDs of seen anime
      release.map((list) => {
        list.entries.map((entry) => {
          if (
            entry.media.status === "RELEASING" &&
            !seenIds.has(entry.media.id)
          ) {
            releasingAnime.push(entry.media);
            seenIds.add(entry.media.id); // Add the ID to the Set
          }
          progress.push(entry);
        });
      });
      setReleaseData(releasingAnime);
      setProg(progress);
    }
    getRelease();
  }, [release]);

  const [listAnime, setListAnime] = useState(null);
  const [listManga, setListManga] = useState(null);
  const [planned, setPlanned] = useState(null);
  const [user, setUser] = useState(null);
  const [removed, setRemoved] = useState();

  const [prog, setProg] = useState(null);

  const popular = populars?.data;
  const data = detail.data[0];

  useEffect(() => {
    async function userData() {
      try {
        if (sessions?.user?.name) {
          await fetch(`/api/user/profile`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: sessions.user.name,
            }),
          });
        }
      } catch (error) {
        console.log(error);
      }
      let data;
      try {
        if (sessions?.user?.name) {
          const res = await fetch(
            `/api/user/profile?name=${sessions.user.name}`
          );
          if (!res.ok) {
            switch (res.status) {
              case 404: {
                console.log("user not found");
                break;
              }
              case 500: {
                console.log("server error");
                break;
              }
              default: {
                console.log("unknown error");
                break;
              }
            }
          } else {
            data = await res.json();
            // Do something with the data
          }
        }
      } catch (error) {
        console.error(error);
        // Handle the error here
      }
      if (!data) {
        const dat = JSON.parse(localStorage.getItem("artplayer_settings"));
        if (dat) {
          const arr = Object.keys(dat).map((key) => dat[key]);
          const newFirst = arr?.sort((a, b) => {
            return new Date(b?.createdAt) - new Date(a?.createdAt);
          });

          const uniqueTitles = new Set();

          // Filter out duplicates and store unique entries
          const filteredData = newFirst.filter((entry) => {
            if (uniqueTitles.has(entry.aniTitle)) {
              return false;
            }
            uniqueTitles.add(entry.aniTitle);
            return true;
          });

          setUser(filteredData);
        }
      } else {
        // Create a Set to store unique aniTitles
        const uniqueTitles = new Set();

        // Filter out duplicates and store unique entries
        const filteredData = data?.WatchListEpisode.filter((entry) => {
          if (uniqueTitles.has(entry.aniTitle)) {
            return false;
          }
          uniqueTitles.add(entry.aniTitle);
          return true;
        });
        setUser(filteredData);
      }
      // const data = await res.json();
    }
    userData();
  }, [sessions?.user?.name, removed]);

  useEffect(() => {
    async function userData() {
      if (!sessions?.user?.name) return;

      const getMedia =
        currentAnime.find((item) => item.status === "CURRENT") || null;
      const listAnime = getMedia?.entries
        .map(({ media }) => media)
        .filter((media) => media);

      const getManga =
        currentManga?.find((item) => item.status === "CURRENT") || null;
      const listManga = getManga?.entries
        .map(({ media }) => media)
        .filter((media) => media);

      const planned = plan?.[0]?.entries
        .map(({ media }) => media)
        .filter((media) => media);

      if (listManga) {
        setListManga(listManga);
      }
      if (listAnime) {
        setListAnime(listAnime);
      }
      if (planned) {
        setPlanned(planned);
      }
    }
    userData();
  }, [sessions?.user?.name, currentAnime, plan]);

  // console.log({ recentAdded });

  return (
    <Fragment>
      <Head>
        <title>Streamsora</title>
        <meta charSet="UTF-8"></meta>
        <link rel="icon" href="/streamsora.png" />
        <link rel="canonical" href="https://streamsora.live/en/" /><meta name="twitter:card" content="summary_large_image" />
        {/* Write the best SEO for this homepage */}
        <meta
          name="description"
          content="Unveil your next cherished anime or manga obsession! Streamsora presents an expansive vault of premium content, conveniently available across various devices, guaranteeing uninterrupted enjoyment. Dive into the Streamsora experience today and commence your journey into a world of limitless entertainment!"
        />
        <meta name="robots" content="index, follow" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://streamsora.live/" />
        <meta
          name="twitter:title"
          content="StreamSora: Your Gateway to Free Anime and Manga Streaming Delight"
        />
        <meta property="og:image" content="/streamsora.png" />
        <meta property="og:site_name" content="Streamsora" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Streamsora - Free Anime and Manga Streaming"
        />
        <meta
          name="twitter:description"
          content="Embark on a journey to discover your next beloved anime or manga series! Streamsora boasts an extensive collection of top-tier content, easily accessible across various devices, ensuring a seamless streaming experience devoid of any disruptions. Begin your Streamsora adventure today and immerse yourself in the world of limitless entertainment!"
        />
        <meta name="twitter:image" content="/streamsora.png" />
      </Head>
      <MobileNav sessions={sessions} hideProfile={true} />

      <NewNavbar paddingY="pt-2 lg:pt-10" withNav={true} home={true} />
      <div className="h-auto w-screen bg-[#141519] text-[#dbdcdd]">
        {/* PC / TABLET */}
        <div className="hidden justify-center lg:flex my-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
            className="relative grid grid-rows-2 items-center lg:flex lg:h-auto lg:w-[80%] lg:justify-between"
          >
            <div className="center z-10 row-start-1 flex justify-center lg:justify-start">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5 }}
                className="relative lg:h-auto lg:w-[100%] lg:scale-100"
              >
                <div className="absolute lg:h-auto lg:w-[100%]" />
                <Image
                  src={data?.bannerImage} // Add the optional chaining operator
                  alt={`cover ${(data && (data.title.english || data.title.romaji)) || ''}`}
                  width={2048} // Set the width for larger screens
                  height={1536} // Set the height for larger screens
                  quality={100}
                  priority
                  className="rounded-tl-[4px] rounded-tr-[4px] rounded-bl-[4px] rounded-br-[4px] ring-1 ring-[#66ccff] object-cover bg-blend-overlay lg:h-[500px] lg:w-[100%]"
                />

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 flex flex-col justify-end items-start bg-gradient-to-t from-[#141519] to-transparent rounded-bl-[4px] rounded-br-[4px]"
                >
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.5 }}
                    className="text-white text-2xl lg:text-3xl font-bold m-3"
                  >
                    {data.title.english}
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.5 }}
                    className="h-[9.5rem] text-white whitespace-normal overflow-hidden overflow-ellipsis max-w-[600px] text-xs md:text-sm mt-15 m-3"
                    dangerouslySetInnerHTML={{ __html: data?.description }}
                  />
                  <motion.a
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    transition={{ duration: 0.5 }}
                    href={`/en/anime/${data.id}`}
                    className="rounded-sm rounded-tl-[4px] rounded-tr-[4px] rounded-bl-[4px] rounded-br-[4px] p-3 text-[#66ccff] border border-[#66ccff] hover:bg-[#66ccff] hover:text-white hover:ring-2 hover:ring-[#66ccff] transition-all duration-300 text-md font-karla font-light m-3"
                  >
                    START WATCHING
                  </motion.a>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {sessions && (
          <div className="flex items-center justify-center lg:bg-none mt-4 lg:mt-0 w-screen">
            <div className="lg:w-[85%] w-screen px-5 lg:px-0 lg:text-4xl flex items-center gap-3 text-2xl font-bold font-karla">
              {getGreetings() && (
                <>
                  {getGreetings()},
                  <h1 className="lg:hidden">{sessions?.user?.name}</h1>
                </>
              )}
              <button
                onClick={() => signOut()}
                className="hidden text-center relative lg:flex justify-center group"
              >
                {sessions?.user?.name}
                <span className="absolute text-sm z-50 w-20 text-center bottom-11 text-white shadow-lg opacity-0 bg-secondary p-1 rounded-md font-karla font-light invisible group-hover:visible group-hover:opacity-100 duration-300 transition-all">
                  Sign Out
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="lg:mt-16 mt-5 flex flex-col items-center">
          <motion.div
            className="w-screen flex-none lg:w-[87%]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, staggerChildren: 0.2 }} // Add staggerChildren prop
          >
            {user?.length > 0 && user?.some((i) => i?.watchId) && (
              <motion.section // Add motion.div to each child component
                key="recentlyWatched"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="recentlyWatched"
                  section="Recently Watched"
                  userData={user}
                  userName={sessions?.user?.name}
                  setRemoved={setRemoved}
                />
              </motion.section>
            )}

            {sessions && releaseData?.length > 0 && (
              <motion.section // Add motion.div to each child component
                key="onGoing"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="onGoing"
                  section="On-Going Anime"
                  data={releaseData}
                  og={prog}
                  userName={sessions?.user?.name}
                />
              </motion.section>
            )}

            {sessions && listAnime?.length > 0 && (
              <motion.section // Add motion.div to each child component
                key="listAnime"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="listAnime"
                  section="Your Watch List"
                  data={listAnime}
                  og={prog}
                  userName={sessions?.user?.name}
                />
              </motion.section>
            )}

            {sessions && listManga?.length > 0 && (
              <motion.section // Add motion.div to each child component
                key="listManga"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="listManga"
                  section="Your Manga List"
                  data={listManga}
                   og={prog}
                  userName={sessions?.user?.name}
                />
              </motion.section>
            )}

            {/* {recommendations.length > 0 && (
              <div className="space-y-5 mb-10">
                <div className="px-5">
                  <p className="text-sm lg:text-base">
                    Based on Your List
                    <br />
                    <span className="font-karla text-[20px] lg:text-3xl font-bold">
                      Recommendations
                    </span>
                  </p>
                </div>
                <UserRecommendation data={recommendations} />
              </div>
            )} */}

            {/* SECTION 2 */}
            {sessions && planned?.length > 0 && (
              <motion.section // Add motion.div to each child component
                key="plannedAnime"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="plannedAnime"
                  section="Your Plan"
                  data={planned}
                  userName={sessions?.user?.name}
                />
              </motion.section>
            )}
          </motion.div>

          <motion.div
            className="w-screen flex-none lg:w-[87%]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, staggerChildren: 0.2 }} // Add staggerChildren prop
          >
            {/* SECTION 3 */}
            {recentAdded?.length > 0 && (
              <motion.section // Add motion.div to each child component
                key="recentAdded"
                initial={{ y: 20, opacity: 0 }}
                transition={{ duration: 0.5 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="recentAdded"
                  section="New Episodes"
                  data={recentAdded}
                />
              </motion.section>
            )}

            {/* SECTION 4 */}
            {detail && (
              <motion.section // Add motion.div to each child component
                key="trendingAnime"
                initial={{ y: 20, opacity: 0 }}
                transition={{ duration: 0.5 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="trendingAnime"
                  section="Trending Now"
                  data={detail.data}
                />
              </motion.section>
            )}

            {/* SECTION 5 */}
            {popular && (
              <motion.section // Add motion.div to each child component
                key="popularAnime"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Content
                  ids="popularAnime"
                  section="Popular Anime"
                  data={popular}
                />
              </motion.section>
            )}

            <motion.section // Add motion.div to each child component
              key="Genres"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <Genres />

              {/* Schedule */}
            {anime.length > 1 && (
              <motion.section // Add motion.div to each child component
                key="schedule"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Schedule
                  data={anime[0]}
                  anime={anime}
                  update={update}
                  scheduleData={schedules}
                />
              </motion.section>
            )}
              </motion.section>
          </motion.div>
        </div>
      </div>
      <Footer />
    </Fragment>
  );
}
