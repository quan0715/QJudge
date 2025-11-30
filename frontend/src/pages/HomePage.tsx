import { Button, Grid, Column, Tile } from '@carbon/react';
import { ArrowRight, Code, Trophy, ChartLine } from '@carbon/icons-react';
import { Link } from 'react-router-dom';

const HomePage = () => {
  return (
    <div style={{ width: '100%' }}>
      {/* Hero Section */}
      <section className="premium-gradient-bg" style={{ padding: '8rem 2rem', position: 'relative', overflow: 'hidden', backgroundImage: 'url(/src/assets/home_hero_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
        {/* Overlay for readability */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 51, 161, 0.8)' }} />

        <Grid style={{ position: 'relative', zIndex: 1 }}>
          <Column lg={16} md={8} sm={4}>
            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
              <h1 className="animate-slide-up" style={{ fontSize: '4rem', fontWeight: 'bold', marginBottom: '1.5rem', lineHeight: '1.2' }}>
                Master Algorithms with <br />
                <span className="text-gradient" style={{ background: 'linear-gradient(to right, #fff, #a5a5a5)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NYCU Online Judge</span>
              </h1>
              <p className="animate-slide-up" style={{ fontSize: '1.5rem', marginBottom: '3rem', opacity: 0.9, animationDelay: '0.2s' }}>
                Join the elite community of problem solvers. Practice, compete, and elevate your coding skills to the next level.
              </p>
              <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
                <Button renderIcon={ArrowRight} as={Link} to="/problems" size="2xl" style={{ marginRight: '1rem' }}>
                  Start Practicing
                </Button>
                <Button kind="ghost" as={Link} to="/contests" size="2xl" style={{ color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}>
                  View Contests
                </Button>
              </div>
            </div>
          </Column>
        </Grid>
      </section>

      {/* Features Section */}
      <section style={{ padding: '4rem 2rem', background: 'var(--cds-layer-01)' }}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <h2 style={{ textAlign: 'center', marginBottom: '3rem', fontSize: '2.5rem' }}>Why NYCU OJ?</h2>
          </Column>
          <Column lg={5} md={4} sm={4} style={{ marginBottom: '2rem' }}>
            <Tile className="glass-panel" style={{ height: '100%', textAlign: 'center', padding: '2rem', background: 'var(--cds-layer-02)' }}>
              <Code size={48} style={{ fill: 'var(--nycu-primary)', marginBottom: '1rem' }} />
              <h3>Rich Problem Set</h3>
              <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)' }}>Access a vast library of problems ranging from basic data structures to advanced algorithms.</p>
            </Tile>
          </Column>
          <Column lg={6} md={4} sm={4} style={{ marginBottom: '2rem' }}>
             <Tile className="glass-panel" style={{ height: '100%', textAlign: 'center', padding: '2rem', background: 'var(--cds-layer-02)' }}>
              <Trophy size={48} style={{ fill: '#f1c21b', marginBottom: '1rem' }} />
              <h3>Competitive Contests</h3>
              <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)' }}>Participate in weekly contests and challenge yourself against the best coders.</p>
            </Tile>
          </Column>
          <Column lg={5} md={4} sm={4} style={{ marginBottom: '2rem' }}>
             <Tile className="glass-panel" style={{ height: '100%', textAlign: 'center', padding: '2rem', background: 'var(--cds-layer-02)' }}>
              <ChartLine size={48} style={{ fill: '#24a148', marginBottom: '1rem' }} />
              <h3>Real-time Analytics</h3>
              <p style={{ marginTop: '1rem', color: 'var(--cds-text-secondary)' }}>Track your progress with detailed statistics and performance analysis.</p>
            </Tile>
          </Column>
        </Grid>
      </section>

      {/* Announcements Section */}
      <section style={{ padding: '4rem 2rem', background: 'var(--cds-layer-02)' }}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem' }}>Latest Announcements</h2>
                <Link to="/announcements" style={{ fontSize: '1rem', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
                  View All <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                </Link>
             </div>
          </Column>
          <Column lg={8} md={4} sm={4}>
            <Tile style={{ marginBottom: '1rem', borderLeft: '4px solid var(--nycu-primary)', transition: 'transform 0.2s' }} className="hover-lift">
              <h4 style={{ marginBottom: '0.5rem' }}>System Maintenance</h4>
              <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>Sunday, 10:00 PM - 12:00 AM</p>
              <p>The system will be undergoing scheduled maintenance to improve performance.</p>
            </Tile>
          </Column>
          <Column lg={8} md={4} sm={4}>
            <Tile style={{ marginBottom: '1rem', borderLeft: '4px solid #f1c21b', transition: 'transform 0.2s' }} className="hover-lift">
              <h4 style={{ marginBottom: '0.5rem' }}>New Contest Available</h4>
              <p style={{ color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>Saturday, 2:00 PM</p>
              <p>Join the Weekly Contest #123. Topics include Dynamic Programming and Graphs.</p>
            </Tile>
          </Column>
        </Grid>
      </section>
    </div>
  );
};

export default HomePage;
