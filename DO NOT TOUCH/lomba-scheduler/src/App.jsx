import { useState, useEffect } from 'react';
import { fetchLombaLeague } from './data/api';
import SchedulerScreen from './screens/SchedulerScreen';

export default function App() {
    var [data, setData] = useState(null);
    var [error, setError] = useState(null);

    useEffect(function () {
        fetchLombaLeague()
            .then(function (d) { setData(d); })
            .catch(function (e) { setError(e.message); });
    }, []);

    if (error) return <div className="screen"><div className="loading">Error: {error}</div></div>;
    if (!data) return <div className="screen"><div className="loading">Cargando...</div></div>;

    return <SchedulerScreen leagueData={data} />;
}
